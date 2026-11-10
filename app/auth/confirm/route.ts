import { NextResponse } from "next/server";

import { emailFromClaims, isAllowlisted } from "@/lib/auth";
import { hasPublicEnv } from "@/lib/env-public";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!hasPublicEnv()) {
    return NextResponse.redirect(new URL("/admin/login?error=config", url.origin));
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type === "email") {
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    failed = Boolean(error);
  }

  if (failed) return NextResponse.redirect(new URL("/admin/login?error=link", url.origin));

  const { data } = await supabase.auth.getClaims();
  const email = emailFromClaims(data?.claims);
  if (!email || !(await isAllowlisted(supabase, email))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/admin/login?error=forbidden", url.origin));
  }

  const next = safeNext(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin";
  return value;
}
