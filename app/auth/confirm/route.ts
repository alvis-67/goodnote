import { NextResponse } from "next/server";

import { isAllowlisted, sessionEmail } from "@/lib/auth";
import { getAuth } from "@/lib/auth/server";
import { isDeskReady } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isDeskReady()) {
    return NextResponse.redirect(new URL("/admin/login?error=config", url.origin));
  }

  const auth = getAuth();
  const { data, error } = await auth.getSession();
  const email = error ? null : sessionEmail(data?.user);
  if (!email || !(await isAllowlisted(email))) {
    await auth.signOut();
    return NextResponse.redirect(new URL("/admin/login?error=link", url.origin));
  }

  const next = safeNext(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin";
  return value;
}
