import "server-only";

import { readSession } from "@/lib/auth/session";
import { dbErrorCode, sql } from "@/lib/db";
import { hasDatabaseEnv, hasSessionEnv, hasStorageEnv } from "@/lib/env";
import { asNumber, asText } from "@/lib/rows";
import { isUuid } from "@/lib/tokens";
import { authorizeStoredDownload, type DownloadAccess, type StoredAttachment } from "@/lib/download-plan";

function attachmentFrom(row: Record<string, unknown> | undefined): StoredAttachment | null {
  if (!row) return null;
  const id = asText(row.id)?.toLowerCase() ?? "";
  const messageId = asText(row.message_id)?.toLowerCase() ?? "";
  const requestId = asText(row.request_id)?.toLowerCase() ?? "";
  const storagePath = asText(row.storage_path) ?? "";
  const requestClientId = asText(row.request_client_id)?.toLowerCase() ?? "";
  const fileName = asText(row.file_name) ?? "";
  const mimeType = asText(row.mime_type) ?? "";
  if (!id || !messageId || !requestId || !storagePath || !requestClientId || !fileName) return null;
  return {
    id,
    messageId,
    requestId,
    storagePath,
    requestClientId,
    fileName,
    mimeType,
    sizeBytes: asNumber(row.size_bytes),
  };
}

export async function openAttachmentDownload(id: string): Promise<DownloadAccess | { ok: false; status: number; error: string }> {
  if (!hasDatabaseEnv() || !hasSessionEnv() || !hasStorageEnv()) {
    return { ok: false, status: 503, error: "系統尚未完成設定。" };
  }
  const session = await readSession();
  if (!session) return { ok: false, status: 401, error: "請先登入。" };
  const normalized = id.toLowerCase();
  if (!isUuid(normalized)) return { ok: false, status: 404, error: "找不到檔案。" };

  try {
    const rows = await sql()`
      select
        a.id,
        a.message_id,
        a.request_id,
        a.storage_path,
        a.file_name,
        a.mime_type,
        a.size_bytes,
        r.client_id as request_client_id
      from attachments a
      join requests r on r.id = a.request_id
      join messages m on m.id = a.message_id and m.request_id = a.request_id
      where a.id = ${normalized}
        and a.client_id = r.client_id
      limit 1
    `;
    const actor =
      session.kind === "admin"
        ? { role: "admin" as const }
        : { role: "client" as const, clientId: session.client.id };
    return authorizeStoredDownload(actor, attachmentFrom(rows[0]));
  } catch (error) {
    console.error("attachment lookup failed", dbErrorCode(error));
    return { ok: false, status: 500, error: "未能開啟檔案。" };
  }
}
