import { connection } from "next/server";

import { AdminHeader } from "@/components/admin-header";
import { SetupRequired } from "@/components/setup-required";
import { requireAdmin } from "@/lib/auth";
import { countAdminUnread } from "@/lib/data";
import { hasPublicEnv } from "@/lib/env-public";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!hasPublicEnv()) return <SetupRequired />;
  const { email } = await requireAdmin();
  const unread = await countAdminUnread();
  return (
    <div className="min-h-full bg-desk text-ink">
      <AdminHeader email={email} unread={unread} />
      <div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
