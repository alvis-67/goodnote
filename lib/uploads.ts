import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  displayFileName,
  isAllowedMime,
  MAX_FILE_BYTES,
  parseStoragePath,
  resolveFile,
  STORAGE_BUCKET,
  buildStoragePath,
  type FileMeta,
} from "@/lib/files";
import { createSecretClient } from "@/lib/supabase/secret";

type AppClient = SupabaseClient<Database>;

export type PreparedUpload = {
  path: string;
  token: string;
  contentType: string;
  fileName: string;
};

export async function prepareUploads(input: {
  clientId: string;
  requestId: string;
  messageId: string;
  files: FileMeta[];
}): Promise<{ ok: true; uploads: PreparedUpload[] } | { ok: false; error: string }> {
  const secret = createSecretClient();
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
    const { data, error } = await secret.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !data || data.path !== path) {
      console.error("createSignedUploadUrl failed", error?.message);
      return { ok: false, error: "未能準備檔案上載，請稍後再試。" };
    }
    uploads.push({
      path,
      token: data.token,
      contentType: resolved.mime,
      fileName: resolved.fileName,
    });
  }

  return { ok: true, uploads };
}

export async function finalizeUploads(input: {
  supabase: AppClient;
  clientId: string;
  requestId: string;
  messageId: string;
  files: { path: string; fileName: string }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = createSecretClient();
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

    const { data, error } = await secret.storage.from(STORAGE_BUCKET).info(file.path);
    if (error || !data) return { ok: false, error: "有檔案尚未完成上載。" };
    const mime = data.contentType ?? "";
    const size = data.size ?? 0;
    if (!isAllowedMime(mime) || size <= 0 || size > MAX_FILE_BYTES) {
      return { ok: false, error: "上載的檔案不符合格式或大小限制。" };
    }

    const { error: insertError } = await input.supabase.from("attachments").insert({
      id: parts.attachmentId,
      message_id: input.messageId,
      request_id: input.requestId,
      client_id: input.clientId,
      storage_path: file.path,
      file_name: displayFileName(file.fileName),
      mime_type: mime,
      size_bytes: size,
    });
    if (insertError && insertError.code !== "23505") {
      console.error("attachment insert failed", insertError.code);
      return { ok: false, error: "未能儲存檔案資料。" };
    }
  }

  return { ok: true };
}

export async function signAttachmentPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const signed = new Map<string, string>();
  if (unique.length === 0) return signed;
  const secret = createSecretClient();
  const { data, error } = await secret.storage.from(STORAGE_BUCKET).createSignedUrls(unique, 60 * 60 * 2);
  if (error || !data) {
    console.error("createSignedUrls failed", error?.message);
    return signed;
  }
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
  }
  return signed;
}
