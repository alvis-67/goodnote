"use server";

import { revalidatePath } from "next/cache";

import { insertMessage, messageBody, normalizeFiles, type ActionFailure, type PrepareSuccess } from "@/lib/actions/shared";
import { loadClientContext } from "@/lib/data";
import { dbErrorCode, sql } from "@/lib/db";
import { chainDuplicateError, nextDocumentTopic } from "@/lib/document-chain";
import { isTopicId } from "@/lib/domain";
import { hasDatabaseEnv, hasStorageEnv } from "@/lib/env";
import type { FileMeta } from "@/lib/files";
import { MAX_FILES } from "@/lib/files";
import { clientHomePath, clientRequestPath } from "@/lib/paths";
import { isUuid } from "@/lib/tokens";
import { finalizeUploads, prepareUploads } from "@/lib/uploads";
import { parseWorkLocation } from "@/lib/work-location";

async function clientScope() {
  if (!hasDatabaseEnv()) return { ok: false as const, error: "系統尚未完成設定。" };
  const context = await loadClientContext();
  if (!context) return { ok: false as const, error: "請先登入。" };
  return { ok: true as const, context };
}

export async function prepareClientRequest(input: {
  topic: string;
  body: string;
  files: FileMeta[];
  workLocation: string;
}): Promise<PrepareSuccess | ActionFailure> {
  const scope = await clientScope();
  if (!scope.ok) return scope;
  if (!isTopicId(input.topic)) return { ok: false, error: "請選擇事項。" };
  const workLocation = parseWorkLocation(typeof input.workLocation === "string" ? input.workLocation : "");
  if (!workLocation.ok) return workLocation;
  const body = messageBody(input.body);
  if (!body.ok) return body;
  const files = normalizeFiles(input.files ?? []);
  if (!Array.isArray(files)) return files;
  if (!body.value && files.length === 0) {
    return { ok: false, error: "請填寫內容，或上載至少一個檔案。" };
  }
  if (files.length > 0 && !hasStorageEnv()) return { ok: false, error: "系統尚未完成設定。" };

  let requestId: string | null = null;
  try {
    const rows = await sql()`
      insert into requests (client_id, topic, work_location)
      values (${scope.context.client.id}, ${input.topic}, ${workLocation.value})
      returning id
    `;
    const id = rows[0]?.id;
    requestId = id ? String(id) : null;
  } catch (error) {
    console.error("request insert failed", dbErrorCode(error));
    return { ok: false, error: "未能建立請求。" };
  }
  if (!requestId) return { ok: false, error: "未能建立請求。" };

  const message = await insertMessage({
    requestId,
    authorRole: "client",
    body: body.value,
  });
  const redirectTo = clientRequestPath(requestId);
  if (!message.ok) return { ...message, redirectTo };

  const prepared = await prepareUploads({
    clientId: scope.context.client.id,
    requestId,
    messageId: message.id,
    files,
  });
  if (!prepared.ok) return { ...prepared, redirectTo };

  revalidatePath(redirectTo);
  revalidatePath(clientHomePath);
  return { ok: true, redirectTo, uploads: prepared.uploads };
}

async function linkedChild(clientId: string, parentRequestId: string): Promise<{ id: string; topic: string } | null> {
  const rows = await sql()`
    select id, topic
    from requests
    where parent_request_id = ${parentRequestId}
      and client_id = ${clientId}
    limit 1
  `;
  const row = rows[0];
  if (!row?.id) return null;
  return { id: String(row.id), topic: String(row.topic ?? "") };
}

function duplicateChild(child: { id: string; topic: string }): ActionFailure {
  const topic = isTopicId(child.topic) ? child.topic : null;
  return {
    ok: false,
    error: topic ? chainDuplicateError(topic) : "已經有下一張單，不會再開一張。",
    redirectTo: clientRequestPath(child.id),
  };
}

export async function prepareLinkedRequest(input: {
  parentRequestId: string;
  body: string;
  files: FileMeta[];
  workLocation: string;
}): Promise<PrepareSuccess | ActionFailure> {
  const scope = await clientScope();
  if (!scope.ok) return scope;
  if (!isUuid(input.parentRequestId)) return { ok: false, error: "找不到這個請求。" };

  const parents = await sql()`
    select id, topic
    from requests
    where id = ${input.parentRequestId}
      and client_id = ${scope.context.client.id}
    limit 1
  `;
  const parent = parents[0];
  const parentTopic = parent ? String(parent.topic ?? "") : "";
  if (!parent || !isTopicId(parentTopic)) return { ok: false, error: "找不到這個請求。" };
  const next = nextDocumentTopic(parentTopic);
  if (!next) return { ok: false, error: "這個請求不能再開下一張單。" };

  const existing = await linkedChild(scope.context.client.id, String(parent.id));
  if (existing) return duplicateChild(existing);

  const workLocation = parseWorkLocation(typeof input.workLocation === "string" ? input.workLocation : "");
  if (!workLocation.ok) return workLocation;
  const body = messageBody(input.body);
  if (!body.ok) return body;
  const files = normalizeFiles(input.files ?? []);
  if (!Array.isArray(files)) return files;
  if (!body.value && files.length === 0) {
    return { ok: false, error: "請填寫內容，或上載至少一個檔案。" };
  }
  if (files.length > 0 && !hasStorageEnv()) return { ok: false, error: "系統尚未完成設定。" };

  const parentId = String(parent.id);
  let requestId: string | null = null;
  try {
    const rows = await sql()`
      insert into requests (client_id, topic, work_location, parent_request_id)
      values (${scope.context.client.id}, ${next}, ${workLocation.value}, ${parentId})
      returning id
    `;
    const id = rows[0]?.id;
    requestId = id ? String(id) : null;
  } catch (error) {
    if (dbErrorCode(error) === "23505") {
      const child = await linkedChild(scope.context.client.id, parentId);
      if (child) return duplicateChild(child);
    }
    console.error("linked request insert failed", dbErrorCode(error));
    return { ok: false, error: "未能建立請求。" };
  }
  if (!requestId) return { ok: false, error: "未能建立請求。" };

  const redirectTo = clientRequestPath(requestId);
  revalidatePath(clientRequestPath(parentId));
  revalidatePath(clientHomePath);
  revalidatePath("/admin");
  revalidatePath(`/admin/requests/${parentId}`);

  const message = await insertMessage({
    requestId,
    authorRole: "client",
    body: body.value,
  });
  if (!message.ok) return { ...message, redirectTo };

  const prepared = await prepareUploads({
    clientId: scope.context.client.id,
    requestId,
    messageId: message.id,
    files,
  });
  if (!prepared.ok) return { ...prepared, redirectTo };

  revalidatePath(redirectTo);
  revalidatePath(`/admin/requests/${requestId}`);
  return { ok: true, redirectTo, uploads: prepared.uploads };
}

export async function prepareClientReply(input: {
  requestId: string;
  body: string;
  files: FileMeta[];
}): Promise<PrepareSuccess | ActionFailure> {
  const scope = await clientScope();
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
  if (files.length > 0 && !hasStorageEnv()) return { ok: false, error: "系統尚未完成設定。" };

  const rows = await sql()`
    select id, client_id
    from requests
    where id = ${input.requestId}
      and client_id = ${scope.context.client.id}
    limit 1
  `;
  const request = rows[0];
  if (!request) return { ok: false, error: "找不到這個請求。" };

  const message = await insertMessage({
    requestId: String(request.id),
    authorRole: "client",
    body: body.value,
  });
  const redirectTo = clientRequestPath(String(request.id));
  if (!message.ok) return message;

  const prepared = await prepareUploads({
    clientId: String(request.client_id),
    requestId: String(request.id),
    messageId: message.id,
    files,
  });
  if (!prepared.ok) return { ...prepared, redirectTo };
  revalidatePath(redirectTo);
  return { ok: true, redirectTo, uploads: prepared.uploads };
}

export async function finalizeClientUploads(input: {
  requestId: string;
  messageId: string;
  files: { path: string; fileName: string }[];
}): Promise<{ ok: true; redirectTo: string } | ActionFailure> {
  const scope = await clientScope();
  if (!scope.ok) return scope;
  if (!hasStorageEnv()) return { ok: false, error: "系統尚未完成設定。" };
  if (!isUuid(input.requestId) || !isUuid(input.messageId)) {
    return { ok: false, error: "找不到這個請求。" };
  }
  const rows = await sql()`
    select messages.id, messages.request_id
    from messages
    join requests on requests.id = messages.request_id
    where messages.id = ${input.messageId}
      and messages.request_id = ${input.requestId}
      and requests.client_id = ${scope.context.client.id}
    limit 1
  `;
  if (!rows[0]) return { ok: false, error: "找不到這則訊息。" };
  const saved = await finalizeUploads({
    clientId: scope.context.client.id,
    requestId: input.requestId,
    messageId: input.messageId,
    files: input.files ?? [],
  });
  const redirectTo = clientRequestPath(input.requestId);
  if (!saved.ok) return { ...saved, redirectTo };
  revalidatePath(redirectTo);
  return { ok: true, redirectTo };
}

export async function markClientRequestRead(requestId: string): Promise<void> {
  if (!hasDatabaseEnv() || !isUuid(requestId)) return;
  const context = await loadClientContext();
  if (!context) return;
  await sql()`
    update requests
    set client_unread = false,
        client_last_read_at = now()
    where id = ${requestId}
      and client_id = ${context.client.id}
  `;
}
