import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth/server";
import { hasAuthEnv } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (hasAuthEnv()) {
    await getAuth().signOut();
  }
  return NextResponse.redirect(new URL("/admin/login?error=forbidden", url.origin));
}
