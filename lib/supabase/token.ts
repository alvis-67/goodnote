import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv } from "@/lib/env-public";

export function createTokenClient(accessToken: string): SupabaseClient<Database> {
  const { url, key } = publicSupabaseEnv();
  return createClient<Database>(url, key, {
    global: {
      headers: {
        "x-client-token": accessToken,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
