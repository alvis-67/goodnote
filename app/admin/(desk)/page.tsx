import type { Metadata } from "next";

import { deleteRequest } from "@/lib/actions/admin";
import { DeleteRequest } from "@/components/delete-request";
import { DeskFilters } from "@/components/desk-filters";
import { RequestChainLinks } from "@/components/document-chain";
import { InstantLink } from "@/components/instant-link";
import { RememberAdminList } from "@/components/remember-view";
import { StatusBadge } from "@/components/status-badge";
import { WorkLocation } from "@/components/work-location";
import { loadAdminInbox } from "@/lib/data";
import type { ChainLink } from "@/lib/document-chain";
import { isStatusId, isTopicId } from "@/lib/domain";
import { requestTitle } from "@/lib/request-stage";
import { excerpt, formatRelative } from "@/lib/format";
import { adminDeskHref, adminRequestPath } from "@/lib/paths";
import { isUuid } from "@/lib/tokens";
import { adminCacheKey, toCachedAdminRow } from "@/lib/view-cache";

export const metadata: Metadata = { title: "工作台" };

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; topic?: string; client?: string; delete?: string; notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const status = params.status && isStatusId(params.status) ? params.status : undefined;
  const topic = params.topic && isTopicId(params.topic) ? params.topic : undefined;
  const clientId = params.client && isUuid(params.client) ? params.client : undefined;
  const deleteId = params.delete && isUuid(params.delete) ? params.delete : undefined;
  const inbox = await loadAdminInbox({ status, topic, clientId });
  const deskHref = adminDeskHref({ status, topic, clientId });

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">工作台</h1>
          <p className="mt-1 text-sm text-muted">未讀的新請求和客戶新訊息會排在最前。</p>
        </div>
        <InstantLink href="/admin/clients/new" className="rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white">
          新增客戶
        </InstantLink>
      </div>

      <DeskFilters
        status={status}
        topic={topic}
        clientId={clientId}
        clients={inbox.clients}
        currentHref={deskHref}
      />

      {params.notice === "deleted" ? (
        <p role="status" className="mt-4 rounded-2xl bg-ok-bg px-4 py-3 text-sm text-ok">
          請求已刪除。
        </p>
      ) : null}
      {params.error === "delete" ? (
        <p className="mt-4 rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">未能刪除這則請求。</p>
      ) : null}

      <RememberAdminList
        cacheKey={adminCacheKey({ status, topic, clientId })}
        rows={inbox.rows.map((row) => toCachedAdminRow(row))}
        clients={inbox.clients}
      />

      {inbox.rows.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-navy/15 bg-desk-card px-5 py-8 text-muted">
          未有符合條件的請求。客戶提交後會顯示在這裡。
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {inbox.rows.map((row) => {
            const fresh = row.admin_unread && !row.admin_last_read_at;
            const parent: ChainLink | null =
              row.parent_request_id && row.parent_topic
                ? { id: row.parent_request_id, topic: row.parent_topic }
                : null;
            const child: ChainLink | null =
              row.child_request_id && row.child_topic ? { id: row.child_request_id, topic: row.child_topic } : null;
            return (
              <li
                key={row.id}
                className={`rounded-3xl border bg-desk-card px-4 py-4 ${
                  row.admin_unread ? "border-stamp" : "border-transparent"
                }`}
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
                        {fresh ? "新請求" : "新訊息"}
                      </span>
                    ) : null}
                  </div>
                </InstantLink>
                <RequestChainLinks parent={parent} child={child} hrefFor={adminRequestPath} />
                <div className="mt-3 flex justify-end border-t border-navy/10 pt-3">
                  <DeleteRequest
                    requestId={row.id}
                    confirming={deleteId === row.id}
                    action={deleteRequest}
                    cancelHref={deskHref}
                    askLabel={`刪除${row.company_name}的${requestTitle(row.topic, row.stage)}`}
                    compact
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
