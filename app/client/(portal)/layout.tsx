import { connection } from "next/server";

import { ClientHeader } from "@/components/client-header";
import { SetupRequired } from "@/components/setup-required";
import { requireClient } from "@/lib/auth";
import { isDeskReady } from "@/lib/env";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!isDeskReady()) return <SetupRequired />;
  const client = await requireClient();
  return (
    <div className="min-h-full bg-paper">
      <ClientHeader companyName={client.companyName} contactName={client.contactName} unread={client.unread} />
      <div className="mx-auto w-full max-w-lg px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
