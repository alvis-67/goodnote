import "server-only";

import { dbErrorCode, sql } from "@/lib/db";
import { MAX_BODY_LENGTH, MAX_FILES, validateFiles, type FileMeta } from "@/lib/files";
import { parseMessageBody } from "@/lib/clients";
import { isUuid } from "@/lib/tokens";
import type { UploadTicket } from "@/lib/upload-plan";

export type { UploadTicket };
export type ActionFailure = { ok: false; error: string; redirectTo?: string };
export type PrepareSuccess = {
  ok: true;
  redirectTo: string;
  uploads: UploadTicket[];
};

export function normalizeFiles(files: FileMeta[]): FileMeta[] | ActionFailure {
  if (!Array.isArray(files) || files.length > MAX_FILES) {
    return { ok: false, error: `最多上載 ${MAX_FILES} 個檔案。` };
  }
  const normalized = files.map((file) => ({
    name: String(file?.name ?? ""),
    type: String(file?.type ?? ""),
    size: Number(file?.size ?? 0),
  }));
  const invalid = validateFiles(normalized);
  if (invalid) return { ok: false, error: invalid };
  return normalized;
}

export function messageBody(body: string): { ok: true; value: string } | ActionFailure {
  if (body.length > MAX_BODY_LENGTH + 500) {
    return { ok: false, error: "內容太長，請精簡至 4000 字以內。" };
  }
  return parseMessageBody(body);
}

export async function insertMessage(input: {
  requestId: string;
  authorRole: "client" | "admin";
  body: string;
}): Promise<{ ok: true; id: string } | ActionFailure> {
  if (!isUuid(input.requestId)) return { ok: false, error: "找不到這個請求。" };
  try {
    const rows = await sql()`
      insert into messages (request_id, author_role, kind, body)
      values (
        ${input.requestId},
        ${input.authorRole},
        'message',
        ${input.body.length > 0 ? input.body : null}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: "未能送出訊息。" };
    return { ok: true, id: String(id) };
  } catch (error) {
    console.error("message insert failed", dbErrorCode(error));
    return { ok: false, error: "未能送出訊息。" };
  }
}
