import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { advanceClientRequestStage } from "@/lib/actions/stage";
import { AdvanceStage } from "@/components/advance-stage";
import { ClientRequestHeading } from "@/components/client-request-heading";
import { DocumentChain } from "@/components/document-chain";
import { MarkClientRead } from "@/components/mark-read";
import { Thread } from "@/components/thread";
import { getClientRequest, loadClientRequestChain, loadClientThread } from "@/lib/data";
import { hasStorageEnv, isDeskReady } from "@/lib/env";
import { clientRequestPath } from "@/lib/paths";
import { stageAdvanceError, stageAdvanceLabel, stageAdvanceNote, stageAdvancedNotice } from "@/lib/request-stage";
import { signAttachmentPaths } from "@/lib/uploads";

export const metadata: Metadata = { title: "請求" };

export default async function ClientRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!isDeskReady()) return null;
  const request = await getClientRequest(id);
  if (!request) notFound();
  const [chain, thread] = await Promise.all([loadClientRequestChain(request.id), loadClientThread(id)]);
  const urls = hasStorageEnv()
    ? await signAttachmentPaths(
        thread.attachments.map((file) => file.storage_path),
        { clientId: request.client_id },
      )
    : new Map<string, string>();
  const advanceLabel = stageAdvanceLabel(request.topic, request.stage);

  return (
    <main>
      <MarkClientRead requestId={request.id} />
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
      <div className="mt-5">
        <Thread messages={thread.messages} attachments={thread.attachments} urls={urls} topic={request.topic} />
      </div>
    </main>
  );
}
