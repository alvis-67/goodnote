import type { ChainLink } from "@/lib/document-chain";
import { isStatusId, isTopicId, type StatusId, type TopicId } from "@/lib/domain";
import { adminDeskHref } from "@/lib/paths";
import { isLegalStage, isStageId, type StageId } from "@/lib/request-stage";
import { isUuid } from "@/lib/tokens";
import type { MutationResult } from "@/lib/mutation";

/**
 * One browser tab keeps the last list and request it showed, so the next
 * tap can paint before Neon answers. The record is tied to the signed-in
 * role and account. A different account replaces it, and logout deletes it.
 */
export type CacheScope = {
  role: "client" | "admin";
  accountId: string;
};

export type RequestProgress = {
  status: StatusId;
  stage: StageId;
};

export type CachedClientRequest = {
  id: string;
  client_id: string;
  topic: TopicId;
  stage: StageId;
  status: StatusId;
  work_location: string | null;
  created_at: string;
  last_activity_at: string;
  client_unread: boolean;
  parent: ChainLink | null;
  child: ChainLink | null;
};

export type CachedMessage = {
  id: string;
  author_role: "client" | "admin" | "system";
  kind: "message" | "status_change" | "stage_change";
  body: string | null;
  created_at: string;
};

export type CachedFile = {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

export type CachedClientDetail = {
  savedAt: number;
  request: CachedClientRequest;
  messages: CachedMessage[];
  files: CachedFile[];
};

export type CachedAdminRow = {
  id: string;
  client_id: string;
  company_name: string;
  topic: TopicId;
  stage: StageId;
  status: StatusId;
  work_location: string | null;
  last_activity_at: string;
  latest_body: string | null;
  admin_unread: boolean;
  fresh: boolean;
  parent: ChainLink | null;
  child: ChainLink | null;
};

export type CachedClientOption = {
  id: string;
  company_name: string;
};

export type CachedAdminDetail = {
  savedAt: number;
  request: CachedClientRequest;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  messages: CachedMessage[];
  files: CachedFile[];
};

export type CachedPaint =
  | { kind: "pending"; title: string | null; label: string }
  | { kind: "client-list"; requests: CachedClientRequest[] }
  | { kind: "client-detail"; detail: CachedClientDetail; partial: boolean }
  | { kind: "admin-list"; rows: CachedAdminRow[] }
  | { kind: "admin-detail"; detail: CachedAdminDetail; partial: boolean };

export type ViewStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

const STORAGE_KEY = "goodnote.view.v1";
const MAX_DETAILS = 20;
const MAX_MESSAGES = 80;
const MAX_FILES = 40;

type Lock = RequestProgress;

type AdminListSnapshot = {
  rows: CachedAdminRow[];
  clients: CachedClientOption[];
  savedAt: number;
};

type Envelope = {
  scope: CacheScope;
  clientList: { requests: CachedClientRequest[]; savedAt: number } | null;
  adminLists: Record<string, AdminListSnapshot>;
  clientDetails: Record<string, CachedClientDetail>;
  adminDetails: Record<string, CachedAdminDetail>;
  locks: Record<string, Lock>;
  failure: string | null;
};

export function memoryViewStorage(): ViewStorage {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

export function browserViewStorage(): ViewStorage {
  return {
    get(key) {
      if (typeof sessionStorage === "undefined") return null;
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (typeof sessionStorage === "undefined") return;
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Private mode or a full quota. The screen still loads from the server.
      }
    },
    remove(key) {
      if (typeof sessionStorage === "undefined") return;
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Ignore. A later successful write replaces the record.
      }
    },
  };
}

export function clearViewCache(storage: ViewStorage): void {
  storage.remove(STORAGE_KEY);
}

export function browserViewRecord(): string {
  return browserViewStorage().get(STORAGE_KEY) ?? "";
}

export function adoptScope(storage: ViewStorage, scope: CacheScope): void {
  const envelope = readEnvelope(storage);
  if (!envelope) return;
  if (!sameScope(envelope, scope)) clearViewCache(storage);
}

export function adminCacheKey(filters: { status?: string; topic?: string; clientId?: string }): string {
  return adminDeskHref({
    status: filters.status && isStatusId(filters.status) ? filters.status : undefined,
    topic: filters.topic && isTopicId(filters.topic) ? filters.topic : undefined,
    clientId: filters.clientId && isUuid(filters.clientId) ? filters.clientId : undefined,
  });
}

export function rememberClientList(storage: ViewStorage, scope: CacheScope, requests: CachedClientRequest[]): void {
  if (scope.role !== "client") return;
  const envelope = envelopeForWrite(storage, scope);
  const current = envelope.clientList?.requests ?? [];
  envelope.clientList = {
    requests: mergeById(current, requests.filter(isClientRequest), envelope.locks),
    savedAt: Date.now(),
  };
  writeEnvelope(storage, envelope);
}

export function rememberClientDetail(storage: ViewStorage, scope: CacheScope, detail: CachedClientDetail): void {
  if (scope.role !== "client" || !isClientRequest(detail.request)) return;
  const envelope = envelopeForWrite(storage, scope);
  const id = detail.request.id;
  const current = envelope.clientDetails[id];
  const request = envelope.locks[id] && current ? { ...detail.request, status: current.request.status, stage: current.request.stage } : detail.request;
  envelope.clientDetails[id] = {
    savedAt: Date.now(),
    request,
    messages: detail.messages.filter(isMessage).slice(-MAX_MESSAGES),
    files: detail.files.filter(isFile).slice(0, MAX_FILES),
  };
  prune(envelope.clientDetails);
  writeEnvelope(storage, envelope);
}

export function rememberAdminList(
  storage: ViewStorage,
  scope: CacheScope,
  cacheKey: string,
  snapshot: { rows: CachedAdminRow[]; clients: CachedClientOption[] },
): void {
  if (scope.role !== "admin" || !cacheKey.startsWith("/admin")) return;
  const envelope = envelopeForWrite(storage, scope);
  const current = envelope.adminLists[cacheKey]?.rows ?? [];
  envelope.adminLists[cacheKey] = {
    rows: mergeById(current, snapshot.rows.filter(isAdminRow), envelope.locks),
    clients: snapshot.clients.filter(isClientOption),
    savedAt: Date.now(),
  };
  writeEnvelope(storage, envelope);
}

export function rememberAdminDetail(storage: ViewStorage, scope: CacheScope, detail: CachedAdminDetail): void {
  if (scope.role !== "admin" || !isClientRequest(detail.request)) return;
  const envelope = envelopeForWrite(storage, scope);
  const id = detail.request.id;
  const current = envelope.adminDetails[id];
  const request = envelope.locks[id] && current ? { ...detail.request, status: current.request.status, stage: current.request.stage } : detail.request;
  envelope.adminDetails[id] = {
    savedAt: Date.now(),
    request,
    company_name: text(detail.company_name, 200),
    contact_name: optionalText(detail.contact_name, 200),
    phone: optionalText(detail.phone, 80),
    notes: optionalText(detail.notes, 4000),
    messages: detail.messages.filter(isMessage).slice(-MAX_MESSAGES),
    files: detail.files.filter(isFile).slice(0, MAX_FILES),
  };
  prune(envelope.adminDetails);
  writeEnvelope(storage, envelope);
}

export function rememberProvisionalClientRequest(
  storage: ViewStorage,
  scope: CacheScope,
  input: {
    requestId: string;
    topic: TopicId;
    workLocation: string;
    body: string;
    files: { name: string; type: string; size: number }[];
    createdAt?: string;
  },
): void {
  if (scope.role !== "client" || !isUuid(input.requestId) || !isTopicId(input.topic)) return;
  const now = input.createdAt ?? new Date().toISOString();
  const messageId = `local-${input.requestId}`;
  const request: CachedClientRequest = {
    id: input.requestId,
    client_id: scope.accountId,
    topic: input.topic,
    stage: input.topic,
    status: "pending",
    work_location: input.workLocation,
    created_at: now,
    last_activity_at: now,
    client_unread: false,
    parent: null,
    child: null,
  };
  const existing = readEnvelope(storage);
  const previous =
    existing && sameScope(existing, scope)
      ? (existing.clientList?.requests ?? []).filter((item) => item.id !== request.id)
      : [];
  rememberClientList(storage, scope, [request, ...previous]);
  rememberClientDetail(storage, scope, {
    savedAt: Date.now(),
    request,
    messages: [
      {
        id: messageId,
        author_role: "client",
        kind: "message",
        body: input.body.trim() ? input.body.trim() : null,
        created_at: now,
      },
    ],
    files: input.files.map((file, index) => ({
      id: `local-file-${input.requestId}-${index}`,
      message_id: messageId,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    })),
  });
}

/**
 * The visible status or stage moves first. `previous` is what we put back
 * if the server rejects the write.
 */
export function beginOptimistic(
  storage: ViewStorage,
  scope: CacheScope,
  requestId: string,
  previous: RequestProgress,
  next: RequestProgress,
): void {
  if (!isUuid(requestId) || !isStatusId(previous.status) || !isStatusId(next.status)) return;
  if (!isStageId(previous.stage) || !isStageId(next.stage)) return;
  const envelope = envelopeForWrite(storage, scope);
  if (!envelope.locks[requestId]) envelope.locks[requestId] = { status: previous.status, stage: previous.stage };
  patch(envelope, requestId, next);
  writeEnvelope(storage, envelope);
}

export function settleOptimistic(
  storage: ViewStorage,
  scope: CacheScope,
  requestId: string,
  result: MutationResult,
): MutationResult {
  const envelope = readEnvelope(storage);
  if (!envelope || !sameScope(envelope, scope)) return result;
  const lock = envelope.locks[requestId];
  if (!result.ok && lock) patch(envelope, requestId, lock);
  delete envelope.locks[requestId];
  if (!result.ok) envelope.failure = result.error;
  writeEnvelope(storage, envelope);
  return result;
}

export function takeMutationFailure(storage: ViewStorage): string | null {
  const envelope = readEnvelope(storage);
  if (!envelope?.failure) return null;
  const message = envelope.failure;
  envelope.failure = null;
  writeEnvelope(storage, envelope);
  return message;
}

export function paintCachedView(
  storage: ViewStorage,
  pathname: string,
  search = "",
  expectedRole?: CacheScope["role"],
): CachedPaint {
  const path = normalizePath(pathname);
  const envelope = readEnvelope(storage);
  if (expectedRole && envelope && envelope.scope.role !== expectedRole) return pendingFor(path);
  if (path === "/client/new") return { kind: "pending", title: "新請求", label: "正在開啟…" };
  if (!envelope) return pendingFor(path);

  if (path === "/client") {
    if (!envelope.clientList) return pendingFor(path);
    return { kind: "client-list", requests: envelope.clientList.requests };
  }

  if (path.startsWith("/client/requests/")) {
    const id = path.slice("/client/requests/".length);
    if (!isUuid(id)) return pendingFor(path);
    const detail = envelope.clientDetails[id];
    if (detail) return { kind: "client-detail", detail, partial: false };
    const summary = envelope.clientList?.requests.find((item) => item.id === id);
    if (!summary) return pendingFor(path);
    return {
      kind: "client-detail",
      partial: true,
      detail: { savedAt: 0, request: summary, messages: [], files: [] },
    };
  }

  if (path === "/admin") {
    const key = adminCacheKey(filtersFromSearch(search));
    const exact = envelope.adminLists[key];
    if (exact) return { kind: "admin-list", rows: exact.rows };
    const full = key === "/admin" ? null : envelope.adminLists["/admin"];
    if (full) return { kind: "admin-list", rows: filterAdminRows(full.rows, search) };
    return pendingFor(path);
  }

  if (path.startsWith("/admin/requests/")) {
    const id = path.slice("/admin/requests/".length);
    if (!isUuid(id)) return pendingFor(path);
    const detail = envelope.adminDetails[id];
    if (detail) return { kind: "admin-detail", detail, partial: false };
    const summary = findAdminRow(envelope, id);
    if (!summary) return pendingFor(path);
    return {
      kind: "admin-detail",
      partial: true,
      detail: {
        savedAt: 0,
        request: {
          id: summary.id,
          client_id: summary.client_id,
          topic: summary.topic,
          stage: summary.stage,
          status: summary.status,
          work_location: summary.work_location,
          created_at: summary.last_activity_at,
          last_activity_at: summary.last_activity_at,
          client_unread: false,
          parent: summary.parent,
          child: summary.child,
        },
        company_name: summary.company_name,
        contact_name: null,
        phone: null,
        notes: null,
        messages: [],
        files: [],
      },
    };
  }

  return pendingFor(path);
}

export function toCachedClientRequest(request: {
  id: string;
  client_id: string;
  topic: TopicId;
  stage: StageId;
  status: StatusId;
  work_location: string | null;
  created_at: string;
  last_activity_at: string;
  client_unread: boolean;
  parent?: ChainLink | null;
  child?: ChainLink | null;
}): CachedClientRequest {
  return {
    id: request.id,
    client_id: request.client_id,
    topic: request.topic,
    stage: request.stage,
    status: request.status,
    work_location: request.work_location,
    created_at: request.created_at,
    last_activity_at: request.last_activity_at,
    client_unread: request.client_unread,
    parent: request.parent ?? null,
    child: request.child ?? null,
  };
}

export function toCachedClientDetail(
  request: CachedClientRequest,
  thread: {
    messages: CachedMessage[];
    attachments: { id: string; message_id: string; file_name: string; mime_type: string; size_bytes: number }[];
  },
): CachedClientDetail {
  return {
    savedAt: 0,
    request,
    messages: thread.messages,
    files: thread.attachments.map((file) => ({
      id: file.id,
      message_id: file.message_id,
      file_name: file.file_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
    })),
  };
}

export function toCachedAdminRow(row: {
  id: string;
  client_id: string;
  company_name: string;
  topic: TopicId;
  stage: StageId;
  status: StatusId;
  work_location: string | null;
  last_activity_at: string;
  latest_body: string | null;
  admin_unread: boolean;
  admin_last_read_at: string | null;
  parent_request_id: string | null;
  parent_topic: TopicId | null;
  child_request_id: string | null;
  child_topic: TopicId | null;
}): CachedAdminRow {
  return {
    id: row.id,
    client_id: row.client_id,
    company_name: row.company_name,
    topic: row.topic,
    stage: row.stage,
    status: row.status,
    work_location: row.work_location,
    last_activity_at: row.last_activity_at,
    latest_body: row.latest_body,
    admin_unread: row.admin_unread,
    fresh: row.admin_unread && !row.admin_last_read_at,
    parent: row.parent_request_id && row.parent_topic ? { id: row.parent_request_id, topic: row.parent_topic } : null,
    child: row.child_request_id && row.child_topic ? { id: row.child_request_id, topic: row.child_topic } : null,
  };
}

function pendingFor(path: string): CachedPaint {
  if (path === "/client" || path.startsWith("/client/requests/")) return { kind: "pending", title: "我的請求", label: "正在載入…" };
  if (path === "/client/new") return { kind: "pending", title: "新請求", label: "正在開啟…" };
  if (path === "/admin" || path.startsWith("/admin/requests/")) return { kind: "pending", title: "工作台", label: "正在載入…" };
  if (path.startsWith("/admin/clients")) return { kind: "pending", title: "客戶", label: "正在載入…" };
  if (path === "/admin/password") return { kind: "pending", title: "更改密碼", label: "正在載入…" };
  return { kind: "pending", title: null, label: "正在載入…" };
}

function filtersFromSearch(search: string): { status?: string; topic?: string; clientId?: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    status: params.get("status") ?? undefined,
    topic: params.get("topic") ?? undefined,
    clientId: params.get("client") ?? undefined,
  };
}

function filterAdminRows(rows: CachedAdminRow[], search: string): CachedAdminRow[] {
  const filters = filtersFromSearch(search);
  const status = filters.status && isStatusId(filters.status) ? filters.status : null;
  const topic = filters.topic && isTopicId(filters.topic) ? filters.topic : null;
  const clientId = filters.clientId && isUuid(filters.clientId) ? filters.clientId : null;
  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    if (topic && row.topic !== topic) return false;
    if (clientId && row.client_id !== clientId) return false;
    return true;
  });
}

function findAdminRow(envelope: Envelope, id: string): CachedAdminRow | null {
  for (const list of Object.values(envelope.adminLists)) {
    const row = list.rows.find((item) => item.id === id);
    if (row) return row;
  }
  return null;
}

function patch(envelope: Envelope, requestId: string, next: RequestProgress): void {
  const apply = <T extends { id: string; status: StatusId; stage: StageId }>(row: T): T =>
    row.id === requestId ? { ...row, status: next.status, stage: next.stage } : row;
  if (envelope.clientList) envelope.clientList.requests = envelope.clientList.requests.map(apply);
  for (const list of Object.values(envelope.adminLists)) list.rows = list.rows.map(apply);
  const clientDetail = envelope.clientDetails[requestId];
  if (clientDetail) clientDetail.request = { ...clientDetail.request, status: next.status, stage: next.stage };
  const adminDetail = envelope.adminDetails[requestId];
  if (adminDetail) adminDetail.request = { ...adminDetail.request, status: next.status, stage: next.stage };
}

function mergeById<T extends { id: string; status: StatusId; stage: StageId }>(
  current: T[],
  incoming: T[],
  locks: Record<string, Lock>,
): T[] {
  const currentById = new Map(current.map((row) => [row.id, row]));
  const incomingIds = new Set(incoming.map((row) => row.id));
  const kept = current.filter((row) => locks[row.id] && !incomingIds.has(row.id));
  const merged = incoming.map((row) => {
    const previous = currentById.get(row.id);
    if (!locks[row.id] || !previous) return row;
    return { ...row, status: previous.status, stage: previous.stage };
  });
  return [...kept, ...merged];
}

function envelopeForWrite(storage: ViewStorage, scope: CacheScope): Envelope {
  const existing = readEnvelope(storage);
  if (existing && sameScope(existing, scope)) return existing;
  return emptyEnvelope(scope);
}

function sameScope(envelope: Envelope, scope: CacheScope): boolean {
  return envelope.scope.role === scope.role && envelope.scope.accountId === scope.accountId;
}

function emptyEnvelope(scope: CacheScope): Envelope {
  return {
    scope: { role: scope.role, accountId: scope.accountId },
    clientList: null,
    adminLists: {},
    clientDetails: {},
    adminDetails: {},
    locks: {},
    failure: null,
  };
}

function readEnvelope(storage: ViewStorage): Envelope | null {
  const raw = storage.get(STORAGE_KEY);
  if (!raw) return null;
  try {
    const envelope = validateEnvelope(JSON.parse(raw));
    if (!envelope) {
      storage.remove(STORAGE_KEY);
      return null;
    }
    return envelope;
  } catch {
    storage.remove(STORAGE_KEY);
    return null;
  }
}

function writeEnvelope(storage: ViewStorage, envelope: Envelope): void {
  try {
    storage.set(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Leave the previous record if this one cannot be stored.
  }
}

function prune<T extends { savedAt: number }>(records: Record<string, T>): void {
  const entries = Object.entries(records);
  if (entries.length <= MAX_DETAILS) return;
  entries.sort((left, right) => left[1].savedAt - right[1].savedAt);
  for (const [id] of entries.slice(0, entries.length - MAX_DETAILS)) delete records[id];
}

function validateEnvelope(value: unknown): Envelope | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Envelope>;
  const scope = record.scope;
  if (!scope || (scope.role !== "client" && scope.role !== "admin")) return null;
  if (typeof scope.accountId !== "string" || scope.accountId.length < 1 || scope.accountId.length > 200) return null;
  const envelope = emptyEnvelope(scope);
  const clientRequests = record.clientList && Array.isArray(record.clientList.requests) ? record.clientList.requests.filter(isClientRequest) : null;
  envelope.clientList = clientRequests ? { requests: clientRequests, savedAt: 0 } : null;
  if (record.adminLists && typeof record.adminLists === "object") {
    for (const [key, list] of Object.entries(record.adminLists)) {
      if (!key.startsWith("/admin") || !list || !Array.isArray(list.rows)) continue;
      envelope.adminLists[key] = {
        rows: list.rows.filter(isAdminRow),
        clients: Array.isArray(list.clients) ? list.clients.filter(isClientOption) : [],
        savedAt: 0,
      };
    }
  }
  if (record.clientDetails && typeof record.clientDetails === "object") {
    for (const [id, detail] of Object.entries(record.clientDetails)) {
      if (!detail || !isClientRequest(detail.request)) continue;
      envelope.clientDetails[id] = {
        savedAt: typeof detail.savedAt === "number" ? detail.savedAt : 0,
        request: detail.request,
        messages: Array.isArray(detail.messages) ? detail.messages.filter(isMessage) : [],
        files: Array.isArray(detail.files) ? detail.files.filter(isFile) : [],
      };
    }
  }
  if (record.adminDetails && typeof record.adminDetails === "object") {
    for (const [id, detail] of Object.entries(record.adminDetails)) {
      if (!detail || !isClientRequest(detail.request) || typeof detail.company_name !== "string") continue;
      envelope.adminDetails[id] = {
        savedAt: typeof detail.savedAt === "number" ? detail.savedAt : 0,
        request: detail.request,
        company_name: detail.company_name,
        contact_name: optionalText(detail.contact_name, 200),
        phone: optionalText(detail.phone, 80),
        notes: optionalText(detail.notes, 4000),
        messages: Array.isArray(detail.messages) ? detail.messages.filter(isMessage) : [],
        files: Array.isArray(detail.files) ? detail.files.filter(isFile) : [],
      };
    }
  }
  if (record.locks && typeof record.locks === "object") {
    for (const [id, lock] of Object.entries(record.locks)) {
      if (!isUuid(id) || !lock || !isStatusId(lock.status) || !isStageId(lock.stage)) continue;
      envelope.locks[id] = { status: lock.status, stage: lock.stage };
    }
  }
  envelope.failure = typeof record.failure === "string" && record.failure.trim() ? record.failure : null;
  return envelope;
}

function isClientRequest(value: unknown): value is CachedClientRequest {
  if (!value || typeof value !== "object") return false;
  const row = value as CachedClientRequest;
  return (
    isUuid(row.id) &&
    typeof row.client_id === "string" &&
    isTopicId(String(row.topic)) &&
    isStageId(String(row.stage)) &&
    isLegalStage(row.topic, row.stage) &&
    isStatusId(String(row.status)) &&
    (row.work_location === null || typeof row.work_location === "string") &&
    typeof row.created_at === "string" &&
    typeof row.last_activity_at === "string" &&
    typeof row.client_unread === "boolean" &&
    isLink(row.parent) &&
    isLink(row.child)
  );
}

function isAdminRow(value: unknown): value is CachedAdminRow {
  if (!value || typeof value !== "object") return false;
  const row = value as CachedAdminRow;
  return (
    isUuid(row.id) &&
    isUuid(row.client_id) &&
    typeof row.company_name === "string" &&
    isTopicId(String(row.topic)) &&
    isStageId(String(row.stage)) &&
    isLegalStage(row.topic, row.stage) &&
    isStatusId(String(row.status)) &&
    (row.work_location === null || typeof row.work_location === "string") &&
    typeof row.last_activity_at === "string" &&
    (row.latest_body === null || typeof row.latest_body === "string") &&
    typeof row.admin_unread === "boolean" &&
    typeof row.fresh === "boolean" &&
    isLink(row.parent) &&
    isLink(row.child)
  );
}

function isLink(value: ChainLink | null): boolean {
  if (value === null) return true;
  return Boolean(value && isUuid(value.id) && isTopicId(String(value.topic)));
}

function isMessage(value: unknown): value is CachedMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as CachedMessage;
  const author = message.author_role;
  const kind = message.kind;
  return (
    typeof message.id === "string" &&
    (author === "client" || author === "admin" || author === "system") &&
    (kind === "message" || kind === "status_change" || kind === "stage_change") &&
    (message.body === null || typeof message.body === "string") &&
    typeof message.created_at === "string"
  );
}

function isFile(value: unknown): value is CachedFile {
  if (!value || typeof value !== "object") return false;
  const file = value as CachedFile;
  return (
    typeof file.id === "string" &&
    typeof file.message_id === "string" &&
    typeof file.file_name === "string" &&
    typeof file.mime_type === "string" &&
    typeof file.size_bytes === "number"
  );
}

function isClientOption(value: unknown): value is CachedClientOption {
  if (!value || typeof value !== "object") return false;
  const client = value as CachedClientOption;
  return isUuid(client.id) && typeof client.company_name === "string";
}

function text(value: string, max: number): string {
  return value.slice(0, max);
}

function optionalText(value: string | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizePath(pathname: string): string {
  const bare = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare;
}
