"use server";

import { revalidatePath } from "next/cache";

import { loadClientContext } from "@/lib/data";
import { isTopicId } from "@/lib/domain";
import type { FileMeta } from "@/lib/files";
import { MAX_FILES } from "@/lib/files";
import { clientRequestPath } from "@/lib/paths";
import { createTokenClient } from "@/lib/supabase/token";
import { hasPublicEnv } from "@/lib/env-public";
import { hasSecretEnv } from "@/lib/supabase/secret";
import { isAccessToken, isUuid } from "@/lib/tokens";
import { finalizeUploads, prepareUploads } from "@/lib/uploads";
import { insertMessage, messageBody, normalizeFiles, type ActionFailure, type PrepareSuccess } from "@/lib/actions/shared";

async function clientScope(token: string) {
  if (!hasPublicEnv() || !hasSecretEnv()) {
    return { ok: false as const, error: "系統尚未完成設定。" };
  }
  const context = await loadClientContext(token);
  if (!context) return { ok: false as const, error: "連結無效。" };
  return { ok: true as const, context, supabase: createTokenClient(token) };
}

export async function prepareClientRequest(input: {
  token: string;
  topic: string;
  body: string;
  files: FileMeta[];
}): Promise<PrepareSuccess | ActionFailure> {
  const scope = await clientScope(input.token);
  if (!scope.ok) return scope;
  if (!isTopicId(input.topic)) return { ok: false, error: "請選擇事項。" };
  const body = messageBody(input.body);
  if (!body.ok) return body;
  const files = normalizeFiles(input.files ?? []);
  if (!Array.isArray(files)) return files;
  if (!body.value && files.length === 0) {
    return { ok: false, error: "請填寫內容，或上載至少一個檔案。" };
  }

  const { data: request, error } = await scope.supabase
    .from("requests")
    .insert({ client_id: scope.context.client.id, topic: input.topic })
    .select("id")
    .single();
  if (error || !request) {
    console.error("request insert failed", error?.code);
    return { ok: false, error: "未能建立請求。" };
  }

  const message = await insertMessage(scope.supabase, {
    requestId: request.id,
    authorRole: "client",
    body: body.value,
  });
  const redirectTo = clientRequestPath(input.token, request.id);
  if (!message.ok) return { ...message, redirectTo };

  const prepared = await prepareUploads({
    clientId: scope.context.client.id,
    requestId: request.id,
    messageId: message.id,
    files,
  });
  if (!prepared.ok) return { ...prepared, redirectTo };

  revalidatePath(clientRequestPath(input.token, request.id));
  revalidatePath(`/c/${input.token}`);
  return { ok: true, redirectTo, uploads: prepared.uploads };
}

export async function prepareClientReply(input: {
  token: string;
  requestId: string;
  body: string;
  files: FileMeta[];
}): Promise<PrepareSuccess | ActionFailure> {
  const scope = await clientScope(input.token);
  if (!scope.ok) return scope;
  if (!isUuid(input.requestId)) return { ok: false, error: "找不到這個請求。" };
  const body = messageBody(input.body);
  if (!body.ok) return body;
  const files = normalizeFiles(input.files ?? []);
  if (!Array.isArray(files)) return files;
  if (!body.value && files.length === 0) {
    return { ok: false, error: "請填寫內容，或上載至少一個檔案。" };
  }
  if (files.length > MAX_FILES) return { ok: false, error: `最多上載 ${MAX_FILES} 個檔案。` };

  const { data: request, error } = await scope.supabase
    .from("requests")
    .select("id, client_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error || !request) return { ok: false, error: "找不到這個請求。" };

  const message = await insertMessage(scope.supabase, {
    requestId: request.id,
    authorRole: "client",
    body: body.value,
  });
  const redirectTo = clientRequestPath(input.token, request.id);
  if (!message.ok) return message;

  const prepared = await prepareUploads({
    clientId: request.client_id,
    requestId: request.id,
    messageId: message.id,
    files,
  });
  if (!prepared.ok) return { ...prepared, redirectTo };
  revalidatePath(redirectTo);
  return { ok: true, redirectTo, uploads: prepared.uploads };
}

export async function finalizeClientUploads(input: {
  token: string;
  requestId: string;
  messageId: string;
  files: { path: string; fileName: string }[];
}): Promise<{ ok: true; redirectTo: string } | ActionFailure> {
  const scope = await clientScope(input.token);
  if (!scope.ok) return scope;
  if (!isUuid(input.requestId) || !isUuid(input.messageId)) {
    return { ok: false, error: "找不到這個請求。" };
  }
  const { data: message, error } = await scope.supabase
    .from("messages")
    .select("id, request_id")
    .eq("id", input.messageId)
    .maybeSingle();
  if (error || !message || message.request_id !== input.requestId) {
    return { ok: false, error: "找不到這則訊息。" };
  }
  const saved = await finalizeUploads({
    supabase: scope.supabase,
    clientId: scope.context.client.id,
    requestId: input.requestId,
    messageId: input.messageId,
    files: input.files ?? [],
  });
  const redirectTo = clientRequestPath(input.token, input.requestId);
  if (!saved.ok) return { ...saved, redirectTo };
  revalidatePath(redirectTo);
  return { ok: true, redirectTo };
}

export async function markClientRequestRead(token: string, requestId: string): Promise<void> {
  if (!hasPublicEnv() || !isAccessToken(token) || !isUuid(requestId)) return;
  const context = await loadClientContext(token);
  if (!context) return;
  const supabase = createTokenClient(token);
  await supabase
    .from("requests")
    .update({
      client_unread: false,
      client_last_read_at: new Date().toISOString(),
    })
    .eq("id", requestId);
}
