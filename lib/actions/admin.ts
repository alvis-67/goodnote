"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getAuth } from "@/lib/auth/server";
import { parseClientDraft } from "@/lib/clients";
import { dbErrorCode, sql } from "@/lib/db";
import { isStatusId, nextStatus } from "@/lib/domain";
import { hasStorageEnv, isDeskReady } from "@/lib/env";
import type { FileMeta } from "@/lib/files";
import { generateAccessToken, isUuid } from "@/lib/tokens";
import { finalizeUploads, prepareUploads } from "@/lib/uploads";
import { insertMessage, messageBody, normalizeFiles, type ActionFailure, type PrepareSuccess } from "@/lib/actions/shared";

export async function createClientAccount(
  _previous: ActionFailure | null,
  formData: FormData,
): Promise<ActionFailure | null> {
  await requireAdmin();
  const parsed = parseClientDraft({
    companyName: String(formData.get("companyName") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.ok) return parsed;

  try {
    const rows = await sql()`
      insert into clients (company_name, contact_name, phone, notes, access_token)
      values (
        ${parsed.value.companyName},
        ${parsed.value.contactName},
        ${parsed.value.phone},
        ${parsed.value.notes},
        ${generateAccessToken()}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: "未能建立客戶。" };
    revalidatePath("/admin/clients");
    redirect(`/admin/clients?created=${String(id)}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error("client insert failed", dbErrorCode(error));
    return { ok: false, error: "未能建立客戶。" };
  }
}

export async function advanceRequestStatus(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const back = `/admin/requests/${requestId}`;
  if (!isUuid(requestId)) redirect("/admin");
  await requireAdmin();
  const rows = await sql()`
    select id, status
    from requests
    where id = ${requestId}
    limit 1
  `;
  const request = rows[0];
  const status = String(request?.status ?? "");
  if (!request || !isStatusId(status)) redirect("/admin");
  const next = nextStatus(status);
  if (!next) redirect(`${back}?error=status`);
  try {
    await sql()`
      update requests
      set status = ${next}
      where id = ${requestId}
    `;
  } catch (error) {
    console.error("status update failed", dbErrorCode(error));
    redirect(`${back}?error=status`);
  }
  revalidatePath(back);
  revalidatePath("/admin");
  redirect(`${back}?notice=status`);
}

export async function prepareAdminReply(input: {
  requestId: string;
  body: string;
  files: FileMeta[];
}): Promise<PrepareSuccess | ActionFailure> {
  if (!isUuid(input.requestId)) return { ok: false, error: "找不到這個請求。" };
  if (!isDeskReady()) return { ok: false, error: "系統尚未完成設定。" };
  await requireAdmin();
  const body = messageBody(input.body);
  if (!body.ok) return body;
  const files = normalizeFiles(input.files ?? []);
  if (!Array.isArray(files)) return files;
  if (!body.value && files.length === 0) {
    return { ok: false, error: "請填寫內容，或上載至少一個檔案。" };
  }
  if (files.length > 0 && !hasStorageEnv()) return { ok: false, error: "系統尚未完成設定。" };

  const rows = await sql()`
    select id, client_id
    from requests
    where id = ${input.requestId}
    limit 1
  `;
  const request = rows[0];
  if (!request) return { ok: false, error: "找不到這個請求。" };

  const message = await insertMessage({
    requestId: String(request.id),
    authorRole: "admin",
    body: body.value,
  });
  const redirectTo = `/admin/requests/${String(request.id)}`;
  if (!message.ok) return message;

  const prepared = await prepareUploads({
    clientId: String(request.client_id),
    requestId: String(request.id),
    messageId: message.id,
    files,
  });
  if (!prepared.ok) return { ...prepared, redirectTo };
  revalidatePath(redirectTo);
  revalidatePath("/admin");
  return { ok: true, redirectTo, uploads: prepared.uploads };
}

export async function finalizeAdminUploads(input: {
  requestId: string;
  messageId: string;
  files: { path: string; fileName: string }[];
}): Promise<{ ok: true; redirectTo: string } | ActionFailure> {
  if (!isUuid(input.requestId) || !isUuid(input.messageId)) {
    return { ok: false, error: "找不到這個請求。" };
  }
  if (!isDeskReady() || !hasStorageEnv()) return { ok: false, error: "系統尚未完成設定。" };
  await requireAdmin();
  const requests = await sql()`
    select id, client_id
    from requests
    where id = ${input.requestId}
    limit 1
  `;
  const request = requests[0];
  if (!request) return { ok: false, error: "找不到這個請求。" };
  const messages = await sql()`
    select id, request_id
    from messages
    where id = ${input.messageId}
    limit 1
  `;
  const message = messages[0];
  if (!message || String(message.request_id) !== String(request.id)) {
    return { ok: false, error: "找不到這則訊息。" };
  }
  const saved = await finalizeUploads({
    clientId: String(request.client_id),
    requestId: String(request.id),
    messageId: input.messageId,
    files: input.files ?? [],
  });
  const redirectTo = `/admin/requests/${String(request.id)}`;
  if (!saved.ok) return { ...saved, redirectTo };
  revalidatePath(redirectTo);
  return { ok: true, redirectTo };
}

export async function markAdminRequestRead(requestId: string): Promise<void> {
  if (!isUuid(requestId)) return;
  await requireAdmin();
  await sql()`
    update requests
    set admin_unread = false,
        admin_last_read_at = now()
    where id = ${requestId}
  `;
}

export async function signOutAdmin(): Promise<void> {
  await requireAdmin();
  await getAuth().signOut();
  redirect("/admin/login");
}

function isRedirect(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT"));
}
