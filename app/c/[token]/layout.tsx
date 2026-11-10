import { connection } from "next/server";

import { ClientHeader } from "@/components/client-header";
import { SetupRequired } from "@/components/setup-required";
import { loadClientContext } from "@/lib/data";
import { hasDatabaseEnv } from "@/lib/env";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  await connection();
  if (!hasDatabaseEnv()) return <SetupRequired />;
  const { token } = await params;
  const context = await loadClientContext(token);
  if (!context) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
        <p className="text-sm font-semibold text-stamp">好事筆記</p>
        <h1 className="mt-3 text-3xl font-semibold">連結無效</h1>
        <p className="mt-3 leading-7 text-muted">這條客戶連結不正確，或已經停用。請向管理員再索取連結。</p>
      </main>
    );
  }

  return (
    <div className="min-h-full bg-paper">
      <ClientHeader
        token={token}
        companyName={context.client.company_name}
        contactName={context.client.contact_name}
        unread={context.unread}
      />
      <div className="mx-auto w-full max-w-lg px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
