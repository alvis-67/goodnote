import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteRequest, setRequestStatus } from "@/lib/actions/admin";
import { advanceAdminRequestStage } from "@/lib/actions/stage";
import { AdvanceStage, StagePrompt } from "@/components/advance-stage";
import { Composer } from "@/components/composer";
import { DeleteRequest } from "@/components/delete-request";
import { DocumentChain } from "@/components/document-chain";
import { MarkAdminRead } from "@/components/mark-read";
import { StatusBadge } from "@/components/status-badge";
import { StatusMenu } from "@/components/status-menu";
import { Thread } from "@/components/thread";
import { WorkLocation } from "@/components/work-location";
import { getAdminRequest, loadAdminRequestChain, loadAdminThread } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { hasStorageEnv, isDeskReady } from "@/lib/env";
import { adminRequestPath } from "@/lib/paths";
import {
  adminStagePrompt,
  requestTitle,
  stageAdvanceError,
  stageAdvanceLabel,
  stageAdvanceNote,
  stageAdvancedNotice,
} from "@/lib/request-stage";
import { signAttachmentPaths } from "@/lib/uploads";

export const metadata: Metadata = { title: "請求" };

export default async function AdminRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string; confirm?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!isDeskReady()) return null;
  const loaded = await getAdminRequest(id);
  if (!loaded) notFound();
  const { request, client } = loaded;
  const [chain, thread] = await Promise.all([loadAdminRequestChain(request.id), loadAdminThread(request.id)]);
  const urls = hasStorageEnv()
    ? await signAttachmentPaths(thread.attachments.map((file) => file.storage_path))
    : new Map<string, string>();
  const advanceLabel = stageAdvanceLabel(request.topic, request.stage);
  const stagePrompt = adminStagePrompt(client.company_name, request.topic, request.stage);

  return (
    <main className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <MarkAdminRead requestId={request.id} />
      <aside className="h-fit rounded-3xl bg-desk-card p-4">
        <p className="text-sm text-muted">客戶</p>
        <h1 className="mt-1 text-xl font-semibold">{client.company_name}</h1>
        {client.contact_name ? <p className="mt-2 text-sm">{client.contact_name}</p> : null}
        {client.phone ? <p className="text-sm">{client.phone}</p> : null}
        {client.notes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{client.notes}</p> : null}
        <Link href="/admin/clients" className="mt-4 inline-flex text-sm font-semibold text-navy">
          全部客戶
        </Link>
      </aside>
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{requestTitle(request.topic, request.stage)}</h2>
            <WorkLocation location={request.work_location} />
            <p className="mt-1 text-sm text-muted">建立於 {formatDateTime(request.created_at)}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>
        <DocumentChain
          parent={chain.parent}
          child={chain.child}
          hrefFor={adminRequestPath}
          className="mt-4 rounded-2xl bg-desk-card px-4 py-4"
        />
        <div className="mt-4 rounded-2xl bg-desk-card px-4 py-3 text-sm leading-6">
          <p>只有管理員可以更改狀態。拉下選單可以隨時改為待處理、處理中、已出單或已入機。</p>
          <StatusMenu requestId={request.id} status={request.status} action={setRequestStatus} />
          {query.notice === "status" ? (
            <p role="status" className="mt-2 text-ok">
              狀態已更新，並寫進時間線。
            </p>
          ) : null}
          {query.notice === "stage" ? (
            <p role="status" className="mt-2 text-ok">
              {stageAdvancedNotice()}
            </p>
          ) : null}
          {query.error === "status" ? <p className="mt-2 text-danger">狀態未能更新。</p> : null}
          {query.error === "stage" ? <p className="mt-2 text-danger">{stageAdvanceError()}</p> : null}
          {advanceLabel ? (
            <AdvanceStage
              requestId={request.id}
              label={advanceLabel}
              note={stageAdvanceNote()}
              prompt={stagePrompt}
              action={advanceAdminRequestStage}
            />
          ) : (
            <StagePrompt prompt={stagePrompt} />
          )}
          <div className="mt-4 border-t border-navy/10 pt-4">
            <DeleteRequest
              requestId={request.id}
              confirming={query.confirm === "delete"}
              action={deleteRequest}
              askHref="?confirm=delete"
              cancelHref="?"
              askLabel={`刪除${client.company_name}的${requestTitle(request.topic, request.stage)}`}
            />
            {query.error === "confirm" ? <p className="mt-2 text-danger">請先確認才可以刪除。</p> : null}
            {query.error === "delete" ? <p className="mt-2 text-danger">未能刪除這則請求。</p> : null}
          </div>
        </div>
        <div className="mt-5">
          <Thread messages={thread.messages} attachments={thread.attachments} urls={urls} topic={request.topic} />
        </div>
        <div className="mt-6 rounded-3xl bg-desk-card p-4">
          <h3 className="font-semibold">回覆</h3>
          <p className="mt-1 text-sm text-muted">可以附上已完成的報價、發票或收據。</p>
          <div className="mt-3">
            <Composer audience="admin" mode="reply" requestId={request.id} />
          </div>
        </div>
      </section>
    </main>
  );
}
