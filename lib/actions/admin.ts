"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { destroyCurrentSession } from "@/lib/auth/session";
import { normalizeLoginName } from "@/lib/auth/login-name";
import { hashPassword, passwordError, verifyPassword } from "@/lib/auth/password";
import { clientsListHref } from "@/lib/client-delete";
import { optionalEmail, parseClientAccount } from "@/lib/clients";
import { dbErrorCode, sql } from "@/lib/db";
import { isDeleteConfirmed, isStatusId } from "@/lib/domain";
import { hasStorageEnv, isDeskReady } from "@/lib/env";
import { storageKeysByRequest, type FileMeta } from "@/lib/files";
import { clientHomePath, clientRequestPath } from "@/lib/paths";
import { asText } from "@/lib/rows";
import { isUuid } from "@/lib/tokens";
import { deleteRequestFiles, finalizeUploads, prepareUploads } from "@/lib/uploads";
import { insertMessage, messageBody, normalizeFiles, type ActionFailure, type PrepareSuccess } from "@/lib/actions/shared";

export async function createClientAccount(
  _previous: ActionFailure | null,
  formData: FormData,
): Promise<ActionFailure | null> {
  await requireAdmin();
  const parsed = parseClientAccount({
    companyName: String(formData.get("companyName") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    loginName: String(formData.get("loginName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.ok) return parsed;

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(parsed.value.password);
  } catch (error) {
    console.error("password hash failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "未能建立客戶。" };
  }

  try {
    const rows = await sql()`
      insert into clients (
        company_name, contact_name, phone, notes, login_name, email, password_hash, password_changed_at
      )
      values (
        ${parsed.value.companyName},
        ${parsed.value.contactName},
        ${parsed.value.phone},
        ${parsed.value.notes},
        ${parsed.value.loginName},
        ${parsed.value.email},
        ${passwordHash},
        now()
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: "未能建立客戶。" };
    revalidatePath("/admin/clients");
    redirect(`/admin/clients?created=${String(id)}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (dbErrorCode(error) === "23505") return { ok: false, error: "這個登入名稱已被使用。" };
    console.error("client insert failed", dbErrorCode(error));
    return { ok: false, error: "未能建立客戶。" };
  }
}

export async function setRequestStatus(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isUuid(requestId)) redirect("/admin");
  await requireAdmin();
  const back = `/admin/requests/${requestId}`;
  if (!isStatusId(status)) redirect(`${back}?error=status`);

  try {
    const updated = await sql()`
      update requests
      set status = ${status}
      where id = ${requestId}
        and status is distinct from ${status}
      returning id
    `;
    if (!updated[0]) {
      const existing = await sql()`
        select id
        from requests
        where id = ${requestId}
        limit 1
      `;
      if (!existing[0]) redirect("/admin");
    }
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error("status update failed", dbErrorCode(error));
    redirect(`${back}?error=status`);
  }

  revalidatePath(back);
  revalidatePath("/admin");
  revalidatePath(clientHomePath);
  revalidatePath(clientRequestPath(requestId));
  redirect(`${back}?notice=status`);
}

export async function deleteRequest(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!isUuid(requestId)) redirect("/admin");
  await requireAdmin();
  const back = `/admin/requests/${requestId}`;
  if (!isDeleteConfirmed(formData.get("confirm"))) redirect(`${back}?error=confirm`);

  let removed = false;
  try {
    const files = await sql()`
      select storage_path
      from attachments
      where request_id = ${requestId}
    `;
    const rows = await sql()`
      delete from requests
      where id = ${requestId}
      returning id
    `;
    removed = Boolean(rows[0]);
    if (removed) {
      await deleteRequestFiles(
        requestId,
        files.map((file) => String(file.storage_path ?? "")),
      );
    }
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error("request delete failed", dbErrorCode(error));
    redirect(`${back}?error=delete`);
  }

  if (!removed) redirect("/admin?error=delete");
  revalidatePath("/admin");
  revalidatePath(back);
  revalidatePath(clientHomePath);
  revalidatePath(clientRequestPath(requestId));
  redirect("/admin?notice=deleted");
}

export async function deleteClient(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") ?? "");
  if (!isUuid(clientId)) redirect(clientsListHref({ error: "missing" }));
  await requireAdmin();
  if (!isDeleteConfirmed(formData.get("confirm"))) {
    redirect(clientsListHref({ deleteId: clientId, error: "confirm" }));
  }

  let removed = false;
  try {
    const files = await sql()`
      select request_id, storage_path
      from attachments
      where client_id = ${clientId}
    `;
    const rows = await sql()`
      delete from clients
      where id = ${clientId}
      returning id
    `;
    removed = Boolean(rows[0]);
    if (removed) {
      const groups = storageKeysByRequest(
        files.map((file) => ({
          requestId: String(file.request_id ?? ""),
          path: String(file.storage_path ?? ""),
        })),
      );
      await Promise.all(groups.map((group) => deleteRequestFiles(group.requestId, group.paths)));
    }
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error("client delete failed", dbErrorCode(error));
    redirect(clientsListHref({ error: "delete" }));
  }

  if (!removed) redirect(clientsListHref({ error: "missing" }));
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  revalidatePath(clientHomePath);
  redirect(clientsListHref({ notice: "deleted" }));
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

export async function changeAdminPassword(
  _previous: ActionFailure | null,
  formData: FormData,
): Promise<ActionFailure | null> {
  const { email } = await requireAdmin();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const nextPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const problem = passwordError(nextPassword);
  if (problem) return { ok: false, error: problem };
  if (nextPassword !== confirmPassword) return { ok: false, error: "兩次輸入的密碼不相同。" };

  const rows = await sql()`
    select password_hash
    from admin_allowlist
    where email = ${email}
    limit 1
  `;
  const currentHash = rows[0]?.password_hash;
  if (typeof currentHash !== "string" || !(await verifyPassword(currentPassword, currentHash))) {
    return { ok: false, error: "目前密碼不正確。" };
  }
  if (await verifyPassword(nextPassword, currentHash)) {
    return { ok: false, error: "新密碼不能與目前密碼相同。" };
  }

  let nextHash: string;
  try {
    nextHash = await hashPassword(nextPassword);
  } catch (error) {
    console.error("password hash failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "未能更改密碼。" };
  }

  try {
    const updated = await sql()`
      with updated as (
        update admin_allowlist
        set password_hash = ${nextHash},
            password_changed_at = now()
        where email = ${email}
          and password_hash = ${currentHash}
        returning email
      ),
      revoked as (
        update sessions
        set revoked_at = now()
        from updated
        where sessions.admin_email = updated.email
          and sessions.account_type = 'admin'
          and sessions.revoked_at is null
        returning sessions.id
      )
      select
        (select count(*)::int from updated) as updated_count,
        (select count(*)::int from revoked) as revoked_count
    `;
    if (Number(updated[0]?.updated_count ?? 0) !== 1) {
      return { ok: false, error: "未能更改密碼。請重新登入後再試。" };
    }
  } catch (error) {
    console.error("admin password change failed", dbErrorCode(error));
    return { ok: false, error: "未能更改密碼。" };
  }

  await destroyCurrentSession();
  redirect("/admin/login?notice=password");
}

export type ClientAccessState = { ok: true; message: string } | ActionFailure;

export async function saveClientAccess(
  _previous: ClientAccessState | null,
  formData: FormData,
): Promise<ClientAccessState> {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  if (!isUuid(clientId)) return { ok: false, error: "找不到這個客戶。" };
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const problem = passwordError(password);
  if (problem) return { ok: false, error: problem };
  if (password !== confirmPassword) return { ok: false, error: "兩次輸入的密碼不相同。" };
  const email = optionalEmail(String(formData.get("email") ?? ""));
  if (!email.ok) return email;

  const existingRows = await sql()`
    select id, login_name
    from clients
    where id = ${clientId}
    limit 1
  `;
  const existing = existingRows[0];
  if (!existing) return { ok: false, error: "找不到這個客戶。" };
  const currentLogin = asText(existing.login_name);
  const loginName = currentLogin ?? normalizeLoginName(formData.get("loginName"));
  if (!loginName) return { ok: false, error: "請填寫 2 至 40 個字元的登入名稱，不能有空白。" };

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (error) {
    console.error("password hash failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "未能重設密碼。" };
  }

  try {
    const updated = await sql()`
      with updated as (
        update clients
        set login_name = ${loginName},
            email = ${email.value},
            password_hash = ${passwordHash},
            password_changed_at = now()
        where id = ${clientId}
          and (
            (${currentLogin}::text is null and login_name is null)
            or login_name = ${currentLogin}
          )
        returning id
      ),
      revoked as (
        update sessions
        set revoked_at = now()
        from updated
        where sessions.client_id = updated.id
          and sessions.account_type = 'client'
          and sessions.revoked_at is null
        returning sessions.id
      )
      select
        (select count(*)::int from updated) as updated_count,
        (select count(*)::int from revoked) as revoked_count
    `;
    if (Number(updated[0]?.updated_count ?? 0) !== 1) {
      return { ok: false, error: "未能重設密碼。" };
    }
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (dbErrorCode(error) === "23505") return { ok: false, error: "這個登入名稱已被使用。" };
    console.error("client credential update failed", dbErrorCode(error));
    return { ok: false, error: "未能重設密碼。" };
  }

  revalidatePath("/admin/clients");
  return {
    ok: true,
    message: currentLogin
      ? "密碼已重設。這位客戶現有的登入已結束，請把新密碼私下告知他們。"
      : "已設定登入。請把登入名稱和密碼私下告知客戶。",
  };
}

function isRedirect(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT"));
}
