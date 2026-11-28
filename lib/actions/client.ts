"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { insertMessage, messageBody, normalizeFiles, type ActionFailure, type PrepareSuccess } from "@/lib/actions/shared";
import { loadClientContext } from "@/lib/data";
import { dbErrorCode, sql } from "@/lib/db";
import { isTopicId } from "@/lib/domain";
import { hasDatabaseEnv, hasStorageEnv } from "@/lib/env";
import type { FileMeta } from "@/lib/files";
import { adminRequestPath, clientHomePath, clientRequestPath } from "@/lib/paths";
import { canClientEditRequestContent, parseRequestContent } from "@/lib/request-content";
import { notifyAdminOfNewRequest } from "@/lib/telegram-notify";
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
  const topic = input.topic;
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
      values (${scope.context.client.id}, ${topic}, ${workLocation.value})
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

  after(() =>
    notifyAdminOfNewRequest({
      requestId,
      messageId: message.id,
      clientId: scope.context.client.id,
      companyName: scope.context.client.company_name,
      topic,
      workLocation: workLocation.value,
      body: body.value,
    }),
  );

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

export async function updateClientRequestContent(input: {
  requestId: string;
  body: string;
}): Promise<{ ok: true } | ActionFailure> {
  const scope = await clientScope();
  if (!scope.ok) return scope;
  if (!isUuid(input.requestId)) return { ok: false, error: "找不到這個請求。" };
  const body = parseRequestContent(input.body);
  if (!body.ok) return body;

  let owner: { client_id: string; status: string; stage: string } | undefined;
  try {
    const rows = await sql()`
      select client_id, status, stage
      from requests
      where id = ${input.requestId}
        and client_id = ${scope.context.client.id}
      limit 1
    `;
    const row = rows[0];
    if (row) {
      owner = {
        client_id: String(row.client_id ?? ""),
        status: String(row.status ?? ""),
        stage: String(row.stage ?? ""),
      };
    }
  } catch (error) {
    console.error("request content read failed", dbErrorCode(error));
    return { ok: false, error: "未能儲存內容。" };
  }
  if (
    !owner ||
    !canClientEditRequestContent({
      actorClientId: scope.context.client.id,
      ownerClientId: owner.client_id,
      status: owner.status,
      stage: owner.stage,
    })
  ) {
    return { ok: false, error: "找不到這個請求。" };
  }

  try {
    const updated = await sql()`
      update messages
      set body = ${body.value.length > 0 ? body.value : null}
      where request_id = ${input.requestId}
        and author_role = 'client'
        and kind = 'message'
        and id = (
          select m.id
          from messages m
          join notification_events e
            on e.message_id = m.id
           and e.request_id = m.request_id
          where m.request_id = ${input.requestId}
            and m.author_role = 'client'
            and m.kind = 'message'
            and e.event_type = 'request_created'
          order by m.created_at asc, m.id asc
          limit 1
        )
      returning id
    `;
    if (!updated[0]) return { ok: false, error: "找不到可以修改的內容。" };
  } catch (error) {
    console.error("request content update failed", dbErrorCode(error));
    return { ok: false, error: "未能儲存內容。" };
  }

  const redirectTo = clientRequestPath(input.requestId);
  revalidatePath(redirectTo);
  revalidatePath(clientHomePath);
  revalidatePath(adminRequestPath(input.requestId));
  revalidatePath("/admin");
  return { ok: true };
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
