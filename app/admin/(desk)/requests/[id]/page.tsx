import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { advanceRequestStatus } from "@/lib/actions/admin";
import { Composer } from "@/components/composer";
import { MarkAdminRead } from "@/components/mark-read";
import { StatusBadge } from "@/components/status-badge";
import { Thread } from "@/components/thread";
import { getAdminRequest, loadThread } from "@/lib/data";
import { advanceLabel, nextStatus, topicLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { hasPublicEnv } from "@/lib/env-public";
import { hasSecretEnv } from "@/lib/supabase/secret";
import { createClient } from "@/lib/supabase/server";
import { signAttachmentPaths } from "@/lib/uploads";

export const metadata: Metadata = { title: "請求" };

export default async function AdminRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!hasPublicEnv()) return null;
  const loaded = await getAdminRequest(id);
  if (!loaded) notFound();
  const { request, client } = loaded;
  const supabase = await createClient();
  const thread = await loadThread(supabase, request.id);
  const urls = hasSecretEnv()
    ? await signAttachmentPaths(thread.attachments.map((file) => file.storage_path))
    : new Map<string, string>();
  const next = nextStatus(request.status);

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
            <h2 className="text-2xl font-semibold">{topicLabel(request.topic)}</h2>
            <p className="mt-1 text-sm text-muted">建立於 {formatDateTime(request.created_at)}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>
        <div className="mt-4 rounded-2xl bg-desk-card px-4 py-3 text-sm leading-6">
          <p>只有管理員可以更改狀態。流程是：待處理 → 處理中 → 已出單 → 已入機。</p>
          {next ? (
            <form action={advanceRequestStatus} className="mt-3">
              <input type="hidden" name="requestId" value={request.id} />
              <button type="submit" className="min-h-11 rounded-xl bg-navy px-4 font-semibold text-white">
                {advanceLabel(next)}
              </button>
            </form>
          ) : (
            <p className="mt-2 font-semibold">已完成入機。</p>
          )}
          {query.notice === "status" ? <p className="mt-2 text-ok">狀態已更新，並寫進時間線。</p> : null}
          {query.error === "status" ? <p className="mt-2 text-danger">狀態未能更新。</p> : null}
        </div>
        <div className="mt-5">
          <Thread messages={thread.messages} attachments={thread.attachments} urls={urls} />
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
