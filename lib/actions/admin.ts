"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { hasPublicEnv } from "@/lib/env-public";
import { hasSecretEnv } from "@/lib/supabase/secret";
import { parseClientDraft } from "@/lib/clients";
import { nextStatus } from "@/lib/domain";
import type { FileMeta } from "@/lib/files";
import { generateAccessToken } from "@/lib/tokens";
import { isUuid } from "@/lib/tokens";
import { finalizeUploads, prepareUploads } from "@/lib/uploads";
import { insertMessage, messageBody, normalizeFiles, type ActionFailure, type PrepareSuccess } from "@/lib/actions/shared";

export async function createClientAccount(
  _previous: ActionFailure | null,
  formData: FormData,
): Promise<ActionFailure | null> {
  const { supabase } = await requireAdmin();
  const parsed = parseClientDraft({
    companyName: String(formData.get("companyName") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.ok) return parsed;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      company_name: parsed.value.companyName,
      contact_name: parsed.value.contactName,
      phone: parsed.value.phone,
      notes: parsed.value.notes,
      access_token: generateAccessToken(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("client insert failed", error?.code);
    return { ok: false, error: "未能建立客戶。" };
  }
  revalidatePath("/admin/clients");
  redirect(`/admin/clients?created=${data.id}`);
}

export async function advanceRequestStatus(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const back = `/admin/requests/${requestId}`;
  if (!isUuid(requestId)) redirect("/admin");
  const { supabase } = await requireAdmin();
  const { data: request, error } = await supabase
    .from("requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !request) redirect("/admin");
  const next = nextStatus(request.status);
  if (!next) redirect(`${back}?error=status`);
  const { error: updateError } = await supabase.from("requests").update({ status: next }).eq("id", requestId);
  if (updateError) {
    console.error("status update failed", updateError.code);
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
  if (!hasPublicEnv() || !hasSecretEnv()) return { ok: false, error: "系統尚未完成設定。" };
  const { supabase } = await requireAdmin();
  const body = messageBody(input.body);
  if (!body.ok) return body;
  const files = normalizeFiles(input.files ?? []);
  if (!Array.isArray(files)) return files;
  if (!body.value && files.length === 0) {
    return { ok: false, error: "請填寫內容，或上載至少一個檔案。" };
  }

  const { data: request, error } = await supabase
    .from("requests")
    .select("id, client_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error || !request) return { ok: false, error: "找不到這個請求。" };

  const message = await insertMessage(supabase, {
    requestId: request.id,
    authorRole: "admin",
    body: body.value,
  });
  const redirectTo = `/admin/requests/${request.id}`;
  if (!message.ok) return message;

  const prepared = await prepareUploads({
    clientId: request.client_id,
    requestId: request.id,
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
  if (!hasPublicEnv() || !hasSecretEnv()) return { ok: false, error: "系統尚未完成設定。" };
  const { supabase } = await requireAdmin();
  const { data: request, error } = await supabase
    .from("requests")
    .select("id, client_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error || !request) return { ok: false, error: "找不到這個請求。" };
  const { data: message } = await supabase
    .from("messages")
    .select("id, request_id")
    .eq("id", input.messageId)
    .maybeSingle();
  if (!message || message.request_id !== request.id) {
    return { ok: false, error: "找不到這則訊息。" };
  }
  const saved = await finalizeUploads({
    supabase,
    clientId: request.client_id,
    requestId: request.id,
    messageId: input.messageId,
    files: input.files ?? [],
  });
  const redirectTo = `/admin/requests/${request.id}`;
  if (!saved.ok) return { ...saved, redirectTo };
  revalidatePath(redirectTo);
  return { ok: true, redirectTo };
}

export async function markAdminRequestRead(requestId: string): Promise<void> {
  if (!isUuid(requestId)) return;
  const { supabase } = await requireAdmin();
  await supabase
    .from("requests")
    .update({
      admin_unread: false,
      admin_last_read_at: new Date().toISOString(),
    })
    .eq("id", requestId);
}

export async function signOutAdmin(): Promise<void> {
  const { supabase } = await requireAdmin();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
