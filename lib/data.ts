import "server-only";

import { cache } from "react";

import { clientCanAccess } from "@/lib/auth/access";
import { currentClient, requireAdmin } from "@/lib/auth";
import type { ClientRow, InboxRow, MessageRow, RequestRow } from "@/lib/database.types";
import { dbErrorCode, sql } from "@/lib/db";
import type { ChainLink } from "@/lib/document-chain";
import type { StatusId, TopicId } from "@/lib/domain";
import { isStatusId, isTopicId } from "@/lib/domain";
import { isLegalStage, isStageId } from "@/lib/request-stage";
import { hasDatabaseEnv, isDeskReady } from "@/lib/env";
import { asBool, asIso, asText } from "@/lib/rows";
import { BUILTIN_REPLY_PRESET, type ReplyPresetRecord } from "@/lib/reply-presets";
import { isUuid } from "@/lib/tokens";
import { displayWorkLocation } from "@/lib/work-location";

export type PublicClient = Pick<ClientRow, "id" | "company_name" | "contact_name" | "phone">;

export type ClientContext = {
  client: PublicClient;
  unread: number;
};

export type RequestListItem = RequestRow & {
  parent: ChainLink | null;
  child: ChainLink | null;
};

export type RequestChain = {
  parent: ChainLink | null;
  child: ChainLink | null;
};

function uuidOrNull(value: unknown): string | null {
  const text = asText(value);
  return text && isUuid(text) ? text : null;
}

function topicOrNull(value: unknown): TopicId | null {
  const text = asText(value);
  return text && isTopicId(text) ? text : null;
}

function linkFrom(id: unknown, topic: unknown): ChainLink | null {
  const linkId = uuidOrNull(id);
  const linkTopic = topicOrNull(topic);
  if (!linkId || !linkTopic) return null;
  return { id: linkId, topic: linkTopic };
}

function requestFrom(row: Record<string, unknown>): RequestRow | null {
  const topic = String(row.topic ?? "");
  const stage = String(row.stage ?? "");
  const status = String(row.status ?? "");
  if (!isTopicId(topic) || !isStageId(stage) || !isLegalStage(topic, stage) || !isStatusId(status)) return null;
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    topic,
    stage,
    status,
    work_location: displayWorkLocation(asText(row.work_location)),
    parent_request_id: uuidOrNull(row.parent_request_id),
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
  if (kind !== "message" && kind !== "status_change" && kind !== "stage_change") return null;
  const statusFrom = asText(row.status_from);
  const statusTo = asText(row.status_to);
  const stageFrom = asText(row.stage_from);
  const stageTo = asText(row.stage_to);
  return {
    id: String(row.id),
    request_id: String(row.request_id),
    author_role: author,
    kind,
    body: asText(row.body),
    status_from: statusFrom && isStatusId(statusFrom) ? statusFrom : null,
    status_to: statusTo && isStatusId(statusTo) ? statusTo : null,
    stage_from: stageFrom && isStageId(stageFrom) ? stageFrom : null,
    stage_to: stageTo && isStageId(stageTo) ? stageTo : null,
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

export async function listClientRequests(): Promise<RequestListItem[]> {
  const client = await currentClient();
  if (!hasDatabaseEnv() || !client) return [];
  const rows = await sql()`
    select r.id, r.client_id, r.topic, r.stage, r.status, r.work_location, r.parent_request_id,
           r.created_at, r.updated_at, r.last_activity_at,
           r.admin_unread, r.admin_last_read_at, r.client_unread, r.client_last_read_at,
           parent.topic as parent_topic,
           child.id as child_id,
           child.topic as child_topic
    from requests r
    left join requests parent
      on parent.id = r.parent_request_id
     and parent.client_id = r.client_id
    left join requests child
      on child.parent_request_id = r.id
     and child.client_id = r.client_id
    where r.client_id = ${client.id}
    order by r.last_activity_at desc
    limit 200
  `;
  return rows.flatMap((row) => {
    const request = requestFrom(row);
    if (!request || !clientCanAccess(client.id, request.client_id)) return [];
    return [
      {
        ...request,
        parent: linkFrom(request.parent_request_id, row.parent_topic),
        child: linkFrom(row.child_id, row.child_topic),
      },
    ];
  });
}

export async function getClientRequest(requestId: string): Promise<RequestRow | null> {
  const client = await currentClient();
  if (!hasDatabaseEnv() || !client || !isUuid(requestId)) return null;
  const rows = await sql()`
    select id, client_id, topic, stage, status, work_location, parent_request_id, created_at, updated_at, last_activity_at,
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

const emptyChain: RequestChain = { parent: null, child: null };

async function loadChain(requestId: string, clientId: string | null): Promise<RequestChain> {
  const rows = await sql()`
    select parent.id as parent_id,
           parent.topic as parent_topic,
           child.id as child_id,
           child.topic as child_topic
    from requests r
    left join requests parent
      on parent.id = r.parent_request_id
     and parent.client_id = r.client_id
    left join requests child
      on child.parent_request_id = r.id
     and child.client_id = r.client_id
    where r.id = ${requestId}
      and (${clientId}::uuid is null or r.client_id = ${clientId})
    limit 1
  `;
  const row = rows[0];
  if (!row) return emptyChain;
  return {
    parent: linkFrom(row.parent_id, row.parent_topic),
    child: linkFrom(row.child_id, row.child_topic),
  };
}

export async function loadClientRequestChain(requestId: string): Promise<RequestChain> {
  const context = await loadClientContext();
  if (!context || !isUuid(requestId)) return emptyChain;
  return loadChain(requestId, context.client.id);
}

export async function loadAdminRequestChain(requestId: string): Promise<RequestChain> {
  await requireAdmin();
  if (!isUuid(requestId)) return emptyChain;
  return loadChain(requestId, null);
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
  const [messages, attachments] = await Promise.all([
    clientId
      ? sql()`
          select id, request_id, author_role, kind, body, status_from, status_to, stage_from, stage_to, created_at
          from messages
          where request_id = ${requestId}
            and request_id in (select id from requests where client_id = ${clientId})
          order by created_at asc
        `
      : sql()`
          select id, request_id, author_role, kind, body, status_from, status_to, stage_from, stage_to, created_at
          from messages
          where request_id = ${requestId}
          order by created_at asc
        `,
    clientId
      ? sql()`
          select id, message_id, file_name, mime_type, size_bytes, storage_path
          from attachments
          where request_id = ${requestId}
            and client_id = ${clientId}
        `
      : sql()`
          select id, message_id, file_name, mime_type, size_bytes, storage_path
          from attachments
          where request_id = ${requestId}
        `,
  ]);
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
    parent_topic: topicOrNull(row.parent_topic),
    child_request_id: uuidOrNull(row.child_request_id),
    child_topic: topicOrNull(row.child_topic),
  };
}

export async function loadAdminInbox(filters: InboxFilters): Promise<{
  rows: InboxRow[];
  clients: Pick<ClientRow, "id" | "company_name">[];
}> {
  if (!isDeskReady()) return { rows: [], clients: [] };
  await requireAdmin();
  const status = filters.status ?? null;
  const topic = filters.topic ?? null;
  const clientId = filters.clientId ?? null;
  const [inbox, clients] = await Promise.all([
    sql()`
      select id, client_id, topic, stage, status, work_location, parent_request_id,
             created_at, updated_at, last_activity_at,
             admin_unread, admin_last_read_at, client_unread, client_last_read_at,
             company_name, contact_name, latest_body,
             parent_topic, child_request_id, child_topic
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
  ]);
  return {
    rows: inbox.flatMap((row) => {
      const item = inboxFrom(row);
      return item ? [item] : [];
    }),
    clients: clients.map((row) => ({ id: String(row.id), company_name: String(row.company_name) })),
  };
}

export async function getAdminRequest(requestId: string): Promise<{
  request: RequestRow;
  client: ClientRow;
} | null> {
  if (!isDeskReady() || !isUuid(requestId)) return null;
  await requireAdmin();
  const rows = await sql()`
    select r.id, r.client_id, r.topic, r.stage, r.status, r.work_location, r.parent_request_id,
           r.created_at, r.updated_at, r.last_activity_at,
           r.admin_unread, r.admin_last_read_at, r.client_unread, r.client_last_read_at,
           c.company_name, c.contact_name, c.phone, c.notes, c.login_name, c.email,
           (c.password_hash is not null) as has_password,
           c.created_at as client_created_at, c.updated_at as client_updated_at
    from requests r
    join clients c on c.id = r.client_id
    where r.id = ${requestId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const request = requestFrom(row);
  if (!request) return null;
  return {
    request,
    client: adminClientFrom({
      ...row,
      id: row.client_id,
      created_at: row.client_created_at,
      updated_at: row.client_updated_at,
    }),
  };
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

export async function listReplyPresets(): Promise<ReplyPresetRecord[]> {
  if (!isDeskReady()) return [];
  await requireAdmin();
  try {
    const rows = await sql()`
      select id, body
      from reply_presets
      order by created_at asc, id asc
    `;
    return rows.flatMap((row) => {
      const id = String(row.id ?? "");
      const body = asText(row.body) ?? "";
      if (!isUuid(id) || !body.trim() || body === BUILTIN_REPLY_PRESET) return [];
      return [{ id, body }];
    });
  } catch (error) {
    console.error("reply preset list failed", dbErrorCode(error));
    return [];
  }
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
