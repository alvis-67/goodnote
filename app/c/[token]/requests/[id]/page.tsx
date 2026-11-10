import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Composer } from "@/components/composer";
import { MarkClientRead } from "@/components/mark-read";
import { StatusBadge } from "@/components/status-badge";
import { Thread } from "@/components/thread";
import { getClientRequest, loadClientThread } from "@/lib/data";
import { topicLabel } from "@/lib/domain";
import { hasDatabaseEnv, hasStorageEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { signAttachmentPaths } from "@/lib/uploads";

export const metadata: Metadata = { title: "請求" };

export default async function ClientRequestPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  if (!hasDatabaseEnv()) return null;
  const request = await getClientRequest(token, id);
  if (!request) notFound();
  const thread = await loadClientThread(token, id);
  const urls = hasStorageEnv()
    ? await signAttachmentPaths(
        thread.attachments.map((file) => file.storage_path),
        { clientId: request.client_id },
      )
    : new Map<string, string>();

  return (
    <main>
      <MarkClientRead token={token} requestId={request.id} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{topicLabel(request.topic)}</h1>
          <p className="mt-1 text-sm text-muted">建立於 {formatDateTime(request.created_at)}</p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-5">
        <Thread messages={thread.messages} attachments={thread.attachments} urls={urls} />
      </div>
      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="text-base font-semibold">補充或回覆</h2>
        <div className="mt-3">
          <Composer audience="client" mode="reply" token={token} requestId={request.id} />
        </div>
      </section>
    </main>
  );
}
