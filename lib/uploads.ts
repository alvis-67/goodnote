import "server-only";

import { randomUUID } from "node:crypto";

import { sql, dbErrorCode } from "@/lib/db";
import { hasDatabaseEnv, hasSessionEnv, hasStorageEnv, sessionSecret } from "@/lib/env";
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
import { readSession } from "@/lib/auth/session";
import { deleteObject, deleteStagingPrefix, inspectObject } from "@/lib/storage";
import { signUploadGrant } from "@/lib/upload-grant";
import { stagingPrefixForRequest, uploadAllowed, type UploadTicket } from "@/lib/upload-plan";

export async function prepareUploads(input: {
  clientId: string;
  requestId: string;
  messageId: string;
  files: FileMeta[];
}): Promise<{ ok: true; uploads: UploadTicket[] } | { ok: false; error: string }> {
  if (input.files.length === 0) return { ok: true, uploads: [] };
  let secret: string;
  try {
    secret = sessionSecret();
  } catch {
    return { ok: false, error: "未能準備檔案上載，請稍後再試。" };
  }

  const uploads: UploadTicket[] = [];
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
    const grant = signUploadGrant(
      { path, size: resolved.size, contentType: resolved.mime, fileName: resolved.fileName },
      secret,
    );
    if (!grant) {
      console.error("upload grant failed");
      return { ok: false, error: "未能準備檔案上載，請稍後再試。" };
    }
    uploads.push({
      path,
      contentType: resolved.mime,
      fileName: resolved.fileName,
      size: resolved.size,
      grant,
    });
  }

  return { ok: true, uploads };
}

export async function authorizeUpload(path: string): Promise<
  | { ok: true; clientId: string; requestId: string; messageId: string; stored: boolean }
  | { ok: false; status: number; error: string }
> {
  if (!hasDatabaseEnv() || !hasSessionEnv() || !hasStorageEnv()) {
    return { ok: false, status: 503, error: "系統尚未完成設定。" };
  }
  const parts = parseStoragePath(path);
  if (!parts) return { ok: false, status: 400, error: "檔案路徑不正確。" };
  const session = await readSession();
  if (!session) return { ok: false, status: 401, error: "請先登入。" };

  let owner = "";
  let stored = false;
  try {
    const rows = await sql()`
      select requests.client_id
      from messages
      join requests on requests.id = messages.request_id
      where messages.id = ${parts.messageId}
        and messages.request_id = ${parts.requestId}
      limit 1
    `;
    owner = String(rows[0]?.client_id ?? "").toLowerCase();
    if (owner) {
      const existing = await sql()`
        select id
        from attachments
        where storage_path = ${path}
        limit 1
      `;
      stored = Boolean(existing[0]);
    }
  } catch (error) {
    console.error("upload authorize failed", dbErrorCode(error));
    return { ok: false, status: 500, error: "未能上載檔案。" };
  }

  const allowed =
    owner.length > 0 &&
    uploadAllowed({
      role: session.kind,
      sessionClientId: session.kind === "client" ? session.client.id.toLowerCase() : undefined,
      pathClientId: parts.clientId,
      requestClientId: owner,
    });
  if (!allowed) return { ok: false, status: 404, error: "找不到這則訊息。" };
  return {
    ok: true,
    clientId: owner,
    requestId: parts.requestId,
    messageId: parts.messageId,
    stored,
  };
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

export async function deleteRequestFiles(requestId: string, paths: string[], clientId?: string): Promise<void> {
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
  const fromPaths = storageKeysForRequest(requestId, paths)
    .map((path) => parseStoragePath(path)?.clientId)
    .find((value): value is string => Boolean(value));
  const prefix = stagingPrefixForRequest(clientId || fromPaths || "", requestId);
  if (!prefix) return;
  try {
    await deleteStagingPrefix(prefix);
  } catch (error) {
    console.error("staging prefix delete failed", error instanceof Error ? error.name : "error");
  }
}

