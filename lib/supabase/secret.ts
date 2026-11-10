import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { ConfigError, publicSupabaseEnv } from "@/lib/env-public";

export function hasSecretEnv(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createSecretClient(): SupabaseClient<Database> {
  const { url, key } = publicSupabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new ConfigError();
  if (secret === key || secret.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SECRET_KEY must be a secret key");
  }
  return createClient<Database>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
