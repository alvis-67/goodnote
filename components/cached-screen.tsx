"use client";

import { useSyncExternalStore } from "react";

import { ClientRequestHeading } from "@/components/client-request-heading";
import { ClientRequestList } from "@/components/client-request-list";
import { DocumentChain } from "@/components/document-chain";
import { InstantLink } from "@/components/instant-link";
import { StatusBadge } from "@/components/status-badge";
import { Thread } from "@/components/thread";
import { WorkLocation } from "@/components/work-location";
import type { MessageRow } from "@/lib/database.types";
import { excerpt, formatRelative } from "@/lib/format";
import { adminRequestPath, clientRequestPath } from "@/lib/paths";
import { requestTitle } from "@/lib/request-stage";
import {
  browserViewRecord,
  browserViewStorage,
  paintCachedView,
  type CachedFile,
  type CachedMessage,
  type CachedPaint,
  type CacheScope,
} from "@/lib/view-cache";

const pendingPaint: CachedPaint = { kind: "pending", title: null, label: "正在載入…" };
const paintCache = new Map<string, CachedPaint>();

function subscribeToLocation() {
  return () => {};
}

function readPaint(role: CacheScope["role"]): CachedPaint {
  const storage = browserViewStorage();
  const key = `${role}\n${window.location.pathname}\n${window.location.search}\n${browserViewRecord()}`;
  const cached = paintCache.get(key);
  if (cached) return cached;
  const paint = paintCachedView(storage, window.location.pathname, window.location.search, role);
  paintCache.set(key, paint);
  if (paintCache.size > 24) {
    const oldest = paintCache.keys().next().value;
    if (oldest) paintCache.delete(oldest);
  }
  return paint;
}

export function CachedScreen({ role }: { role: CacheScope["role"] }) {
  const paint = useSyncExternalStore(subscribeToLocation, () => readPaint(role), () => pendingPaint);
  return <CachedPaintView paint={paint} role={role} />;
}

export function CachedPaintView({ paint, role }: { paint: CachedPaint; role: CacheScope["role"] }) {
  if (paint.kind === "pending") {
    return (
      <main>
        {paint.title ? <h1 className="text-2xl font-semibold">{paint.title}</h1> : null}
        <p role="status" className="mt-2 text-sm text-muted">
          {paint.label}
        </p>
      </main>
    );
  }

  if (paint.kind === "client-list") {
    return (
      <main>
        <h1 className="text-2xl font-semibold">我的請求</h1>
        <Refreshing />
        <ClientRequestList requests={paint.requests} />
      </main>
    );
  }

  if (paint.kind === "client-detail") {
    const request = paint.detail.request;
    return (
      <main>
        <Refreshing />
        <ClientRequestHeading
          topic={request.topic}
          stage={request.stage}
          status={request.status}
          createdAt={request.created_at}
          location={request.work_location}
        />
        <DocumentChain parent={request.parent} child={request.child} hrefFor={clientRequestPath} />
        <div className="mt-5">
          {paint.partial ? <p className="text-sm text-muted">正在載入紀錄…</p> : <CachedThread detail={paint.detail} />}
        </div>
      </main>
    );
  }

  if (paint.kind === "admin-list") {
    return (
      <main>
        <h1 className="text-2xl font-semibold">工作台</h1>
        <Refreshing />
        {paint.rows.length === 0 ? (
          <p className="mt-8 rounded-3xl border border-dashed border-navy/15 bg-desk-card px-5 py-8 text-muted">
            未有符合條件的請求。客戶提交後會顯示在這裡。
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {paint.rows.map((row) => (
              <li
                key={row.id}
                className={`rounded-3xl border bg-desk-card px-4 py-4 ${row.admin_unread ? "border-stamp" : "border-transparent"}`}
              >
                <InstantLink href={adminRequestPath(row.id)} className="block">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {row.company_name}
                      <span className="mx-2 font-normal text-muted">·</span>
                      {requestTitle(row.topic, row.stage)}
                    </p>
                    <StatusBadge status={row.status} />
                  </div>
                  <WorkLocation location={row.work_location} />
                  <p className="mt-2 text-sm text-muted">{excerpt(row.latest_body)}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <time dateTime={row.last_activity_at} className="text-muted">
                      {formatRelative(row.last_activity_at)}
                    </time>
                    {row.admin_unread ? (
                      <span className="rounded-full bg-stamp px-2 py-0.5 text-xs font-semibold text-white">
                        {row.fresh ? "新請求" : "新訊息"}
                      </span>
                    ) : null}
                  </div>
                </InstantLink>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  const request = paint.detail.request;
  return (
    <main>
      <Refreshing />
      <p className="text-sm text-muted">客戶</p>
      <h1 className="mt-1 text-xl font-semibold">{paint.detail.company_name}</h1>
      <h2 className="mt-4 text-2xl font-semibold">{requestTitle(request.topic, request.stage)}</h2>
      <WorkLocation location={request.work_location} />
      <div className="mt-3">
        <StatusBadge status={request.status} />
      </div>
      {role === "admin" ? <DocumentChain parent={request.parent} child={request.child} hrefFor={adminRequestPath} className="mt-4 rounded-2xl bg-desk-card px-4 py-4" /> : null}
      <div className="mt-5">
        {paint.partial ? <p className="text-sm text-muted">正在載入紀錄…</p> : <CachedThread detail={paint.detail} />}
      </div>
    </main>
  );
}

function Refreshing() {
  return (
    <p role="status" className="mt-2 text-sm font-semibold text-muted">
      正在更新…
    </p>
  );
}

function CachedThread({
  detail,
}: {
  detail: { request: { id: string }; messages: CachedMessage[]; files: CachedFile[] };
}) {
  const messages: MessageRow[] = detail.messages.map((message) => ({
    id: message.id,
    request_id: detail.request.id,
    author_role: message.author_role,
    kind: message.kind,
    body: message.body,
    status_from: null,
    status_to: null,
    stage_from: null,
    stage_to: null,
    created_at: message.created_at,
  }));
  const attachments = detail.files.map((file) => ({
    id: file.id,
    message_id: file.message_id,
    file_name: file.file_name,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
  }));
  return <Thread messages={messages} attachments={attachments} />;
}
