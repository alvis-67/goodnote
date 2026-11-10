import { NextResponse, type NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/server";
import { hasAuthEnv } from "@/lib/env";

export async function proxy(request: NextRequest) {
  if (!hasAuthEnv()) return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return NextResponse.next();
  return getAuth().middleware({
    loginUrl: "/admin/login",
    publicRoutes: ["/admin/login"],
  })(request);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
