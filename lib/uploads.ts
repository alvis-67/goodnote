import "server-only";

import { randomUUID } from "node:crypto";

import { sql, dbErrorCode } from "@/lib/db";
import {
  displayFileName,
  isAllowedMime,
  MAX_FILE_BYTES,
  parseStoragePath,
  resolveFile,
  buildStoragePath,
  storageKeysForRequest,
  type FileMeta,
} from "@/lib/files";
import { hasStorageEnv } from "@/lib/env";
import { createUploadUrl, deleteObject, inspectObject, signedDownloadUrl } from "@/lib/storage";

export type PreparedUpload = {
  path: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  contentType: string;
  fileName: string;
};

export async function prepareUploads(input: {
  clientId: string;
  requestId: string;
  messageId: string;
  files: FileMeta[];
}): Promise<{ ok: true; uploads: PreparedUpload[] } | { ok: false; error: string }> {
  const uploads: PreparedUpload[] = [];

  for (const file of input.files) {
    const resolved = resolveFile(file);
    if (!resolved) return { ok: false, error: "檔案格式或大小不符合限制。" };
    const path = buildStoragePath({
      clientId: input.clientId,
      requestId: input.requestId,
      messageId: input.messageId,
      attachmentId: randomUUID(),
      extension: resolved.extension,
    });
    try {
      const url = await createUploadUrl(path, resolved.mime);
      uploads.push({
        path,
        url,
        method: "PUT",
        headers: { "Content-Type": resolved.mime },
        contentType: resolved.mime,
        fileName: resolved.fileName,
      });
    } catch (error) {
      console.error("createUploadUrl failed", error instanceof Error ? error.name : "error");
      return { ok: false, error: "未能準備檔案上載，請稍後再試。" };
    }
  }

  return { ok: true, uploads };
}

export async function finalizeUploads(input: {
  clientId: string;
  requestId: string;
  messageId: string;
  files: { path: string; fileName: string }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const seen = new Set<string>();

  for (const file of input.files) {
    if (seen.has(file.path)) return { ok: false, error: "檔案清單重複。" };
    seen.add(file.path);
    const parts = parseStoragePath(file.path);
    if (
      !parts ||
      parts.clientId !== input.clientId ||
      parts.requestId !== input.requestId ||
      parts.messageId !== input.messageId
    ) {
      return { ok: false, error: "檔案路徑不正確。" };
    }

    const info = await inspectObject(file.path);
    if (!info) return { ok: false, error: "有檔案尚未完成上載。" };
    if (!isAllowedMime(info.contentType) || info.size <= 0 || info.size > MAX_FILE_BYTES) {
      await deleteObject(file.path).catch((error: unknown) => {
        console.error("delete invalid object failed", error instanceof Error ? error.name : "error");
      });
      return { ok: false, error: "上載的檔案不符合格式或大小限制。" };
    }

    try {
      await sql()`
        insert into attachments (
          id, message_id, request_id, client_id, storage_path, file_name, mime_type, size_bytes
        ) values (
          ${parts.attachmentId},
          ${input.messageId},
          ${input.requestId},
          ${input.clientId},
          ${file.path},
          ${displayFileName(file.fileName)},
          ${info.contentType},
          ${info.size}
        )
        on conflict (storage_path) do nothing
      `;
    } catch (error) {
      console.error("attachment insert failed", dbErrorCode(error));
      return { ok: false, error: "未能儲存檔案資料。" };
    }
  }

  return { ok: true };
}

export async function deleteRequestFiles(requestId: string, paths: string[]): Promise<void> {
  if (!hasStorageEnv()) return;
  await Promise.all(
    storageKeysForRequest(requestId, paths).map(async (path) => {
      try {
        await deleteObject(path);
      } catch (error) {
        console.error("attachment object delete failed", error instanceof Error ? error.name : "error");
      }
    }),
  );
}

export async function signAttachmentPaths(
  paths: string[],
  scope?: { clientId: string },
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths)].filter((path) => {
    const parts = parseStoragePath(path);
    if (!parts) return false;
    if (scope && parts.clientId !== scope.clientId) return false;
    return true;
  });
  await Promise.all(
    unique.map(async (path) => {
      const url = await signedDownloadUrl(path);
      if (url) signed.set(path, url);
    }),
  );
  return signed;
}
