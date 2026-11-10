import "server-only";

import { cache } from "react";

import { clientCanAccess } from "@/lib/auth/access";
import { currentClient, requireAdmin } from "@/lib/auth";
import type { ClientRow, InboxRow, MessageRow, RequestRow } from "@/lib/database.types";
import { sql } from "@/lib/db";
import type { StatusId, TopicId } from "@/lib/domain";
import { isStatusId, isTopicId } from "@/lib/domain";
import { hasDatabaseEnv, isDeskReady } from "@/lib/env";
import { asBool, asIso, asText } from "@/lib/rows";
import { isUuid } from "@/lib/tokens";

export type PublicClient = Pick<ClientRow, "id" | "company_name" | "contact_name" | "phone">;

export type ClientContext = {
  client: PublicClient;
  unread: number;
};

function requestFrom(row: Record<string, unknown>): RequestRow | null {
  const topic = String(row.topic ?? "");
  const status = String(row.status ?? "");
  if (!isTopicId(topic) || !isStatusId(status)) return null;
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    topic,
    status,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    last_activity_at: asIso(row.last_activity_at),
    admin_unread: asBool(row.admin_unread),
    admin_last_read_at: asIso(row.admin_last_read_at) || null,
    client_unread: asBool(row.client_unread),
    client_last_read_at: asIso(row.client_last_read_at) || null,
  };
}

function messageFrom(row: Record<string, unknown>): MessageRow | null {
  const author = String(row.author_role ?? "");
  const kind = String(row.kind ?? "");
  if (author !== "client" && author !== "admin" && author !== "system") return null;
  if (kind !== "message" && kind !== "status_change") return null;
  const statusFrom = asText(row.status_from);
  const statusTo = asText(row.status_to);
  return {
    id: String(row.id),
    request_id: String(row.request_id),
    author_role: author,
    kind,
    body: asText(row.body),
    status_from: statusFrom && isStatusId(statusFrom) ? statusFrom : null,
    status_to: statusTo && isStatusId(statusTo) ? statusTo : null,
    created_at: asIso(row.created_at),
  };
}

export const loadClientContext = cache(async (): Promise<ClientContext | null> => {
  const client = await currentClient();
  if (!hasDatabaseEnv() || !client) return null;
  return {
    client: {
      id: client.id,
      company_name: client.companyName,
      contact_name: client.contactName,
      phone: client.phone,
    },
    unread: client.unread,
  };
});

export async function listClientRequests(): Promise<RequestRow[]> {
  const client = await currentClient();
  if (!hasDatabaseEnv() || !client) return [];
  const rows = await sql()`
    select id, client_id, topic, status, created_at, updated_at, last_activity_at,
           admin_unread, admin_last_read_at, client_unread, client_last_read_at
    from requests
    where client_id = ${client.id}
    order by last_activity_at desc
    limit 200
  `;
  return rows.flatMap((row) => {
    const request = requestFrom(row);
    if (!request || !clientCanAccess(client.id, request.client_id)) return [];
    return [request];
  });
}

export async function getClientRequest(requestId: string): Promise<RequestRow | null> {
  const client = await currentClient();
  if (!hasDatabaseEnv() || !client || !isUuid(requestId)) return null;
  const rows = await sql()`
    select id, client_id, topic, status, created_at, updated_at, last_activity_at,
           admin_unread, admin_last_read_at, client_unread, client_last_read_at
    from requests
    where id = ${requestId}
      and client_id = ${client.id}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const request = requestFrom(row);
  if (!request || !clientCanAccess(client.id, request.client_id)) return null;
  return request;
}

export type ThreadAttachment = {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
};

async function loadThreadFor(requestId: string, clientId: string | null): Promise<{
  messages: MessageRow[];
  attachments: ThreadAttachment[];
}> {
  const messages = clientId
    ? await sql()`
        select id, request_id, author_role, kind, body, status_from, status_to, created_at
        from messages
        where request_id = ${requestId}
          and request_id in (select id from requests where client_id = ${clientId})
        order by created_at asc
      `
    : await sql()`
        select id, request_id, author_role, kind, body, status_from, status_to, created_at
        from messages
        where request_id = ${requestId}
        order by created_at asc
      `;
  const attachments = clientId
    ? await sql()`
        select id, message_id, file_name, mime_type, size_bytes, storage_path
        from attachments
        where request_id = ${requestId}
          and client_id = ${clientId}
      `
    : await sql()`
        select id, message_id, file_name, mime_type, size_bytes, storage_path
        from attachments
        where request_id = ${requestId}
      `;
  return {
    messages: messages.flatMap((row) => {
      const message = messageFrom(row);
      return message ? [message] : [];
    }),
    attachments: attachments.map((row) => ({
      id: String(row.id),
      message_id: String(row.message_id),
      file_name: String(row.file_name),
      mime_type: String(row.mime_type),
      size_bytes: Number(row.size_bytes),
      storage_path: String(row.storage_path),
    })),
  };
}

export async function loadClientThread(requestId: string) {
  const context = await loadClientContext();
  if (!context || !isUuid(requestId)) return { messages: [], attachments: [] };
  return loadThreadFor(requestId, context.client.id);
}

export async function loadAdminThread(requestId: string) {
  await requireAdmin();
  if (!isUuid(requestId)) return { messages: [], attachments: [] };
  return loadThreadFor(requestId, null);
}

export type InboxFilters = {
  status?: StatusId;
  topic?: TopicId;
  clientId?: string;
};

function inboxFrom(row: Record<string, unknown>): InboxRow | null {
  const request = requestFrom(row);
  if (!request) return null;
  return {
    ...request,
    company_name: String(row.company_name ?? ""),
    contact_name: asText(row.contact_name),
    latest_body: asText(row.latest_body),
  };
}

export async function loadAdminInbox(filters: InboxFilters): Promise<{
  rows: InboxRow[];
  clients: Pick<ClientRow, "id" | "company_name">[];
  unread: number;
}> {
  if (!isDeskReady()) return { rows: [], clients: [], unread: 0 };
  await requireAdmin();
  const status = filters.status ?? null;
  const topic = filters.topic ?? null;
  const clientId = filters.clientId ?? null;
  const [inbox, clients, unread] = await Promise.all([
    sql()`
      select id, client_id, topic, status, created_at, updated_at, last_activity_at,
             admin_unread, admin_last_read_at, client_unread, client_last_read_at,
             company_name, contact_name, latest_body
      from request_inbox
      where (${status}::text is null or status = ${status})
        and (${topic}::text is null or topic = ${topic})
        and (${clientId}::uuid is null or client_id = ${clientId})
      order by admin_unread desc, last_activity_at desc
      limit 300
    `,
    sql()`
      select id, company_name
      from clients
      order by company_name asc
    `,
    sql()`
      select count(*)::int as count
      from requests
      where admin_unread = true
    `,
  ]);
  return {
    rows: inbox.flatMap((row) => {
      const item = inboxFrom(row);
      return item ? [item] : [];
    }),
    clients: clients.map((row) => ({ id: String(row.id), company_name: String(row.company_name) })),
    unread: Number(unread[0]?.count ?? 0),
  };
}

export async function getAdminRequest(requestId: string): Promise<{
  request: RequestRow;
  client: ClientRow;
} | null> {
  if (!isDeskReady() || !isUuid(requestId)) return null;
  await requireAdmin();
  const requests = await sql()`
    select id, client_id, topic, status, created_at, updated_at, last_activity_at,
           admin_unread, admin_last_read_at, client_unread, client_last_read_at
    from requests
    where id = ${requestId}
    limit 1
  `;
  const request = requests[0] ? requestFrom(requests[0]) : null;
  if (!request) return null;
  const clients = await sql()`
    select id, company_name, contact_name, phone, notes, login_name, email,
           (password_hash is not null) as has_password, created_at, updated_at
    from clients
    where id = ${request.client_id}
    limit 1
  `;
  const row = clients[0];
  if (!row) return null;
  return { request, client: adminClientFrom(row) };
}

export async function listAdminClients(): Promise<ClientRow[]> {
  if (!isDeskReady()) return [];
  await requireAdmin();
  const rows = await sql()`
    select id, company_name, contact_name, phone, notes, login_name, email,
           (password_hash is not null) as has_password, created_at, updated_at
    from clients
    order by created_at desc
  `;
  return rows.map((row) => adminClientFrom(row));
}

function adminClientFrom(row: Record<string, unknown>): ClientRow {
  return {
    id: String(row.id),
    company_name: String(row.company_name),
    contact_name: asText(row.contact_name),
    phone: asText(row.phone),
    notes: asText(row.notes),
    login_name: asText(row.login_name),
    email: asText(row.email),
    has_password: asBool(row.has_password),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

export async function countAdminUnread(): Promise<number> {
  if (!isDeskReady()) return 0;
  await requireAdmin();
  const rows = await sql()`
    select count(*)::int as count
    from requests
    where admin_unread = true
  `;
  return Number(rows[0]?.count ?? 0);
}
