import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { MAX_BODY_LENGTH, MAX_FILES, validateFiles, type FileMeta } from "@/lib/files";
import { parseMessageBody } from "@/lib/clients";
import { isUuid } from "@/lib/tokens";

export type ActionFailure = { ok: false; error: string; redirectTo?: string };
export type UploadTicket = {
  path: string;
  token: string;
  contentType: string;
  fileName: string;
};
export type PrepareSuccess = {
  ok: true;
  redirectTo: string;
  uploads: UploadTicket[];
};

type AppClient = SupabaseClient<Database>;

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

export async function insertMessage(
  supabase: AppClient,
  input: { requestId: string; authorRole: "client" | "admin"; body: string },
): Promise<{ ok: true; id: string } | ActionFailure> {
  if (!isUuid(input.requestId)) return { ok: false, error: "找不到這個請求。" };
  const { data, error } = await supabase
    .from("messages")
    .insert({
      request_id: input.requestId,
      author_role: input.authorRole,
      kind: "message",
      body: input.body.length > 0 ? input.body : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("message insert failed", error?.code);
    return { ok: false, error: "未能送出訊息。" };
  }
  return { ok: true, id: data.id };
}
