import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { normalizeEmail } from "@/lib/auth/email";
import { readSession, type ClientPrincipal } from "@/lib/auth/session";
import { sql } from "@/lib/db";

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

export const requireAdmin = cache(async (): Promise<{ email: string }> => {
  const session = await readSession();
  if (!session || session.kind !== "admin") redirect("/admin/login");
  return { email: session.email };
});

export const requireClient = cache(async (): Promise<ClientPrincipal> => {
  const session = await readSession();
  if (!session || session.kind !== "client") redirect("/client/login");
  return session.client;
});

export const currentClient = cache(async (): Promise<ClientPrincipal | null> => {
  const session = await readSession();
  if (!session || session.kind !== "client") return null;
  return session.client;
});
