import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ClientListLink } from "@/components/client-list-link";
import { Composer } from "@/components/composer";
import { getClientRequest, loadClientRequestChain } from "@/lib/data";
import { chainOpenLabel, chainStartLabel, followUpIntro, nextDocumentTopic } from "@/lib/document-chain";
import { isDeskReady } from "@/lib/env";
import { clientRequestPath } from "@/lib/paths";

export const metadata: Metadata = { title: "開下一張單" };

export default async function FollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDeskReady()) return null;
  const request = await getClientRequest(id);
  if (!request) notFound();
  const next = nextDocumentTopic(request.topic);
  if (!next) notFound();
  const chain = await loadClientRequestChain(request.id);
  if (chain.child) redirect(clientRequestPath(chain.child.id));

  return (
    <main>
      <ClientListLink />
      <h1 className="mt-1 text-2xl font-semibold">{chainStartLabel(next)}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        {followUpIntro(request.topic, next, Boolean(request.work_location))}
      </p>
      <p className="mt-3 text-sm">
        <a href={clientRequestPath(request.id)} className="font-semibold text-navy underline">
          {chainOpenLabel(request.topic)}
        </a>
      </p>
      <div className="mt-5 rounded-3xl border border-line bg-card p-4">
        <Composer
          audience="client"
          mode="follow"
          parentRequestId={request.id}
          topic={next}
          initialWorkLocation={request.work_location ?? ""}
        />
      </div>
    </main>
  );
}
