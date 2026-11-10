import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { loadAdminInbox } from "@/lib/data";
import { STATUSES, TOPICS, isStatusId, isTopicId, topicLabel } from "@/lib/domain";
import { excerpt, formatRelative } from "@/lib/format";
import { isUuid } from "@/lib/tokens";

export const metadata: Metadata = { title: "工作台" };

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; topic?: string; client?: string }>;
}) {
  const params = await searchParams;
  const status = params.status && isStatusId(params.status) ? params.status : undefined;
  const topic = params.topic && isTopicId(params.topic) ? params.topic : undefined;
  const clientId = params.client && isUuid(params.client) ? params.client : undefined;
  const inbox = await loadAdminInbox({ status, topic, clientId });

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">工作台</h1>
          <p className="mt-1 text-sm text-muted">未讀的新請求和客戶新訊息會排在最前。</p>
        </div>
        <Link href="/admin/clients/new" className="rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white">
          新增客戶
        </Link>
      </div>

      <form method="get" className="mt-5 grid gap-3 rounded-3xl border border-navy/10 bg-desk-card p-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          狀態
          <select name="status" defaultValue={status ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 font-normal">
            <option value="">全部</option>
            {STATUSES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          事項
          <select name="topic" defaultValue={topic ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 font-normal">
            <option value="">全部</option>
            {TOPICS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          客戶
          <select name="client" defaultValue={clientId ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 font-normal">
            <option value="">全部</option>
            {inbox.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company_name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button type="submit" className="min-h-11 rounded-xl bg-navy px-4 font-semibold text-white">
            篩選
          </button>
          <Link href="/admin" className="pb-2 text-sm font-semibold text-navy">
            清除
          </Link>
        </div>
      </form>

      {inbox.rows.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-navy/15 bg-desk-card px-5 py-8 text-muted">
          未有符合條件的請求。客戶提交後會顯示在這裡。
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {inbox.rows.map((row) => {
            const fresh = row.admin_unread && !row.admin_last_read_at;
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/requests/${row.id}`}
                  className={`block rounded-3xl border bg-desk-card px-4 py-4 ${
                    row.admin_unread ? "border-stamp" : "border-transparent"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {row.company_name}
                      <span className="mx-2 font-normal text-muted">·</span>
                      {topicLabel(row.topic)}
                    </p>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted">{excerpt(row.latest_body)}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <time dateTime={row.last_activity_at} className="text-muted">
                      {formatRelative(row.last_activity_at)}
                    </time>
                    {row.admin_unread ? (
                      <span className="rounded-full bg-stamp px-2 py-0.5 text-xs font-semibold text-white">
                        {fresh ? "新請求" : "新訊息"}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
