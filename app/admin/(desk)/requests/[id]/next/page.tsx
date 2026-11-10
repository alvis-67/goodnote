import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Composer } from "@/components/composer";
import { getAdminRequest, loadAdminOpeningContent, loadAdminRequestChain } from "@/lib/data";
import { chainOpenLabel, chainStartLabel, followUpIntro } from "@/lib/document-chain";
import { isDeskReady } from "@/lib/env";
import { adminRequestPath } from "@/lib/paths";

export const metadata: Metadata = { title: "開出收據" };

export default async function AdminFollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDeskReady()) return null;
  const loaded = await getAdminRequest(id);
  if (!loaded) notFound();
  const { request, client } = loaded;
  if (request.topic !== "invoice") notFound();

  const [chain, opening] = await Promise.all([
    loadAdminRequestChain(request.id),
    loadAdminOpeningContent(request.id),
  ]);
  if (chain.child) redirect(adminRequestPath(chain.child.id));

  return (
    <main className="mx-auto max-w-lg">
      <p className="text-sm text-muted">客人</p>
      <h1 className="mt-1 text-2xl font-semibold">{client.company_name}</h1>
      <h2 className="mt-4 text-xl font-semibold">{chainStartLabel("receipt")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {followUpIntro("invoice", "receipt", Boolean(request.work_location), opening.length > 0)}
      </p>
      <p className="mt-3 text-sm">
        <Link href={adminRequestPath(request.id)} className="font-semibold text-navy underline">
          {chainOpenLabel(request.topic)}
        </Link>
      </p>
      <div className="mt-5 rounded-3xl bg-desk-card p-4">
        <Composer
          audience="admin"
          mode="follow"
          parentRequestId={request.id}
          topic="receipt"
          initialWorkLocation={request.work_location ?? ""}
          initialBody={opening}
        />
      </div>
    </main>
  );
}
