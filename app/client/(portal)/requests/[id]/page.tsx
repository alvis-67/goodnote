import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { advanceClientRequestStage } from "@/lib/actions/stage";
import { AdvanceStage } from "@/components/advance-stage";
import { ClientRequestHeading } from "@/components/client-request-heading";
import { DocumentChain } from "@/components/document-chain";
import { LiveRequest } from "@/components/live-request";
import { MarkClientRead } from "@/components/mark-read";
import { RememberClientDetail } from "@/components/remember-view";
import { Thread } from "@/components/thread";
import { getClientRequest, loadClientRequestChain, loadClientThread } from "@/lib/data";
import { hasStorageEnv, isDeskReady } from "@/lib/env";
import { clientRequestPath } from "@/lib/paths";
import { stageAdvanceError, stageAdvanceLabel, stageAdvanceNote, stageAdvancedNotice } from "@/lib/request-stage";
import { signAttachmentPaths } from "@/lib/uploads";
import { toCachedClientDetail, toCachedClientRequest } from "@/lib/view-cache";

export const metadata: Metadata = { title: "請求" };

export default async function ClientRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  if (!isDeskReady()) return null;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [request, chain, thread] = await Promise.all([
    getClientRequest(id),
    loadClientRequestChain(id),
    loadClientThread(id),
  ]);
  if (!request) notFound();
  const urls = hasStorageEnv()
    ? await signAttachmentPaths(
        thread.attachments.map((file) => file.storage_path),
        { clientId: request.client_id },
      )
    : new Map<string, string>();
  const advanceLabel = stageAdvanceLabel(request.topic, request.stage);

  const cachedRequest = toCachedClientRequest({ ...request, parent: chain.parent, child: chain.child });

  return (
    <main>
      <RememberClientDetail
        detail={toCachedClientDetail(cachedRequest, {
          messages: thread.messages.map((message) => ({
            id: message.id,
            author_role: message.author_role,
            kind: message.kind,
            body: message.body,
            created_at: message.created_at,
          })),
          attachments: thread.attachments,
        })}
      />
      <MarkClientRead requestId={request.id} />
      <LiveRequest key={request.id} requestId={request.id} topic={request.topic} stage={request.stage} status={request.status}>
      <ClientRequestHeading
        topic={request.topic}
        stage={request.stage}
        status={request.status}
        createdAt={request.created_at}
        location={request.work_location}
      />
      <DocumentChain parent={chain.parent} child={chain.child} hrefFor={clientRequestPath} />
      {query.notice === "stage" ? (
        <p role="status" className="mt-4 text-sm text-ok">
          {stageAdvancedNotice()}
        </p>
      ) : null}
      {query.error === "stage" ? <p className="mt-4 text-sm text-danger">{stageAdvanceError()}</p> : null}
      {advanceLabel ? (
        <section className="mt-4 rounded-3xl border border-line bg-card p-4">
          <h2 className="text-base font-semibold">下一階段</h2>
          <AdvanceStage
            requestId={request.id}
            label={advanceLabel}
            note={stageAdvanceNote()}
            action={advanceClientRequestStage}
          />
        </section>
      ) : null}
      </LiveRequest>
      <div className="mt-5">
        <Thread messages={thread.messages} attachments={thread.attachments} urls={urls} />
      </div>
    </main>
  );
}
