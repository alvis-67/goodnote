import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { normalizeEmail } from "@/lib/auth/email";
import { getAuth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { hasAuthEnv } from "@/lib/env";

type SessionUser = { email?: string | null } | null | undefined;

export const isAllowlisted = cache(async (email: string): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const rows = await sql()`
    select email
    from admin_allowlist
    where email = ${normalized}
    limit 1
  `;
  return rows.length > 0;
});

export function sessionEmail(user: SessionUser): string | null {
  return normalizeEmail(user?.email ?? null);
}

export async function currentAdminEmail(): Promise<string | null> {
  if (!hasAuthEnv()) return null;
  const { data, error } = await getAuth().getSession();
  if (error || !data?.user) return null;
  return sessionEmail(data.user);
}

export const requireAdmin = cache(async (): Promise<{ email: string }> => {
  const email = await currentAdminEmail();
  if (!email) redirect("/admin/login");
  if (!(await isAllowlisted(email))) redirect("/auth/reject");
  return { email };
});
