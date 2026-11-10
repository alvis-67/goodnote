import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClientRequestHeading } from "@/components/client-request-heading";
import { Composer } from "@/components/composer";
import { DocumentChain } from "@/components/document-chain";
import { MarkClientRead } from "@/components/mark-read";
import { Thread } from "@/components/thread";
import { getClientRequest, loadClientRequestChain, loadClientThread } from "@/lib/data";
import { hasStorageEnv, isDeskReady } from "@/lib/env";
import { clientFollowUpPath, clientRequestPath } from "@/lib/paths";
import { signAttachmentPaths } from "@/lib/uploads";

export const metadata: Metadata = { title: "請求" };

export default async function ClientRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return (
    <main>
      <MarkClientRead requestId={request.id} />
      <ClientRequestHeading
        topic={request.topic}
        status={request.status}
        createdAt={request.created_at}
        location={request.work_location}
      />
      <DocumentChain
        topic={request.topic}
        parent={chain.parent}
        child={chain.child}
        hrefFor={clientRequestPath}
        startHref={clientFollowUpPath(request.id)}
      />
      <div className="mt-5">
        <Thread messages={thread.messages} attachments={thread.attachments} urls={urls} />
      </div>
      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="text-base font-semibold">補充或回覆</h2>
        <div className="mt-3">
          <Composer audience="client" mode="reply" requestId={request.id} />
        </div>
      </section>
    </main>
  );
}
