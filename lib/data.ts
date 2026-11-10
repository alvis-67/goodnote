import "server-only";

import { cache } from "react";

import type { StatusId, TopicId } from "@/lib/domain";
import { isStatusId, isTopicId } from "@/lib/domain";
import type { AttachmentRow, ClientRow, InboxRow, MessageRow, RequestRow } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { createTokenClient } from "@/lib/supabase/token";
import { hasPublicEnv } from "@/lib/env-public";
import { isAccessToken, isUuid } from "@/lib/tokens";

export type PublicClient = Pick<ClientRow, "id" | "company_name" | "contact_name" | "phone">;

export type ClientContext = {
  client: PublicClient;
  unread: number;
};

export const loadClientContext = cache(async (token: string): Promise<ClientContext | null> => {
  if (!hasPublicEnv() || !isAccessToken(token)) return null;
  const supabase = createTokenClient(token);
  const [clientResult, unreadResult] = await Promise.all([
    supabase.from("clients").select("id, company_name, contact_name, phone").maybeSingle(),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("client_unread", true),
  ]);
  if (clientResult.error) throw new Error("Failed to load client");
  if (!clientResult.data) return null;
  return {
    client: clientResult.data,
    unread: unreadResult.count ?? 0,
  };
});

export async function listClientRequests(token: string): Promise<RequestRow[]> {
  if (!hasPublicEnv() || !isAccessToken(token)) return [];
  const supabase = createTokenClient(token);
  const { data, error } = await supabase
    .from("requests")
    .select(
      "id, client_id, topic, status, created_at, updated_at, last_activity_at, admin_unread, admin_last_read_at, client_unread, client_last_read_at",
    )
    .order("last_activity_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Failed to list requests");
  return (data ?? []).filter((row) => isTopicId(row.topic) && isStatusId(row.status));
}

export async function getClientRequest(token: string, requestId: string): Promise<RequestRow | null> {
  if (!hasPublicEnv() || !isAccessToken(token) || !isUuid(requestId)) return null;
  const supabase = createTokenClient(token);
  const { data, error } = await supabase
    .from("requests")
    .select(
      "id, client_id, topic, status, created_at, updated_at, last_activity_at, admin_unread, admin_last_read_at, client_unread, client_last_read_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("Failed to load request");
  if (!data || !isTopicId(data.topic) || !isStatusId(data.status)) return null;
  return data;
}

export type ThreadAttachment = Pick<
  AttachmentRow,
  "id" | "message_id" | "file_name" | "mime_type" | "size_bytes" | "storage_path"
>;

export async function loadThread(
  supabase: ReturnType<typeof createTokenClient> | Awaited<ReturnType<typeof createClient>>,
  requestId: string,
): Promise<{ messages: MessageRow[]; attachments: ThreadAttachment[] }> {
  const [messagesResult, attachmentsResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id, request_id, author_role, kind, body, status_from, status_to, created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true }),
    supabase
      .from("attachments")
      .select("id, message_id, file_name, mime_type, size_bytes, storage_path")
      .eq("request_id", requestId),
  ]);
  if (messagesResult.error || attachmentsResult.error) throw new Error("Failed to load thread");
  return {
    messages: messagesResult.data ?? [],
    attachments: attachmentsResult.data ?? [],
  };
}

export async function loadClientThread(token: string, requestId: string) {
  return loadThread(createTokenClient(token), requestId);
}

export type InboxFilters = {
  status?: StatusId;
  topic?: TopicId;
  clientId?: string;
};

export async function loadAdminInbox(filters: InboxFilters): Promise<{
  rows: InboxRow[];
  clients: Pick<ClientRow, "id" | "company_name">[];
  unread: number;
}> {
  if (!hasPublicEnv()) return { rows: [], clients: [], unread: 0 };
  const supabase = await createClient();
  let query = supabase
    .from("request_inbox")
    .select(
      "id, client_id, topic, status, created_at, updated_at, last_activity_at, admin_unread, admin_last_read_at, client_unread, client_last_read_at, company_name, contact_name, latest_body",
    )
    .order("admin_unread", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .limit(300);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.topic) query = query.eq("topic", filters.topic);
  if (filters.clientId) query = query.eq("client_id", filters.clientId);

  const [inboxResult, clientsResult, unreadResult] = await Promise.all([
    query,
    supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("admin_unread", true),
  ]);

  if (inboxResult.error || clientsResult.error) throw new Error("Failed to load inbox");
  return {
    rows: (inboxResult.data ?? []).filter((row) => isTopicId(row.topic) && isStatusId(row.status)),
    clients: clientsResult.data ?? [],
    unread: unreadResult.count ?? 0,
  };
}

export async function getAdminRequest(requestId: string): Promise<{
  request: RequestRow;
  client: ClientRow;
} | null> {
  if (!hasPublicEnv() || !isUuid(requestId)) return null;
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("requests")
    .select(
      "id, client_id, topic, status, created_at, updated_at, last_activity_at, admin_unread, admin_last_read_at, client_unread, client_last_read_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("Failed to load request");
  if (!request || !isTopicId(request.topic) || !isStatusId(request.status)) return null;
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, notes, access_token, created_at, updated_at")
    .eq("id", request.client_id)
    .maybeSingle();
  if (clientError) throw new Error("Failed to load client");
  if (!client) return null;
  return { request, client };
}

export async function listAdminClients(): Promise<ClientRow[]> {
  if (!hasPublicEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, notes, access_token, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Failed to list clients");
  return data ?? [];
}

export async function countAdminUnread(): Promise<number> {
  if (!hasPublicEnv()) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("admin_unread", true);
  return count ?? 0;
}
