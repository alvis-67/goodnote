import { NextResponse } from "next/server";

import { hasPublicEnv } from "@/lib/env-public";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (hasPublicEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/admin/login?error=forbidden", url.origin));
}
