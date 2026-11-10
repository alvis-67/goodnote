import "server-only";

import { redirect } from "next/navigation";

import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type AppClient = Awaited<ReturnType<typeof createClient>>;

export function emailFromClaims(claims: { email?: string } | null | undefined): string | null {
  const email = claims?.email?.trim().toLowerCase();
  return email ? email : null;
}

export async function currentAdminEmail(supabase: AppClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return emailFromClaims(data.claims);
}

export async function isAllowlisted(supabase: AppClient, email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function requireAdmin(): Promise<{ supabase: AppClient; email: string }> {
  const supabase = await createClient();
  const email = await currentAdminEmail(supabase);
  if (!email) redirect("/admin/login");
  const allowed = await isAllowlisted(supabase, email);
  if (!allowed) redirect("/auth/reject");
  return { supabase, email };
}

export type { Database };
