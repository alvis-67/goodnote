import { NextResponse, type NextRequest } from "next/server";

import { gateRequest, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/routes";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const decision = gateRequest(pathname, token.length >= 40);
  if (decision.type === "redirect") {
    const response = NextResponse.redirect(new URL(decision.to, request.url));
    if (pathname === "/c" || pathname.startsWith("/c/")) {
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("Cache-Control", "no-store");
    }
    return response;
  }
  if (!decision.refreshCookie || token.length < 40) return NextResponse.next();
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/client", "/client/:path*", "/c", "/c/:path*"],
};
