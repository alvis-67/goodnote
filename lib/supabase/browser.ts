import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv } from "@/lib/env-public";

export function createBrowserSupabase() {
  const { url, key } = publicSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
