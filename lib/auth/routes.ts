export const SESSION_COOKIE = "gn_session";

/** How long the browser keeps the cookie. The server does not use this as an expiry. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10;

export function sessionCookieOptions(): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export type RequestGate =
  | { type: "next"; refreshCookie: boolean }
  | { type: "redirect"; to: string };

export function gateRequest(pathname: string, hasSessionCookie: boolean): RequestGate {
  if (pathname === "/c" || pathname.startsWith("/c/")) {
    return { type: "redirect", to: "/client/login" };
  }
  if (pathname === "/admin/login") return { type: "next", refreshCookie: false };
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasSessionCookie) return { type: "redirect", to: "/admin/login" };
    return { type: "next", refreshCookie: true };
  }
  if (pathname === "/client/login") return { type: "next", refreshCookie: false };
  if (pathname === "/client" || pathname.startsWith("/client/")) {
    if (!hasSessionCookie) return { type: "redirect", to: "/client/login" };
    return { type: "next", refreshCookie: true };
  }
  return { type: "next", refreshCookie: false };
}

export type StoredSession = {
  id: string;
  accountType: "admin" | "client";
  adminEmail: string | null;
  clientId: string | null;
  createdAt: string;
  credentialAt: string;
  revokedAt: string | null;
};

export function isSessionActive(input: {
  revokedAt: string | null;
  credentialAt: string;
  passwordChangedAt: string | null;
  createdAt: Date;
  now: Date;
}): boolean {
  if (input.revokedAt) return false;
  if (!input.passwordChangedAt) return false;
  if (input.credentialAt !== input.passwordChangedAt) return false;
  const ageMs = input.now.getTime() - input.createdAt.getTime();
  if (!Number.isFinite(ageMs)) return false;
  return true;
}

export function revokeSessionsForAccount(
  sessions: readonly StoredSession[],
  account: { type: "admin"; email: string } | { type: "client"; clientId: string },
  revokedAt: string,
): StoredSession[] {
  return sessions.map((session) => {
    const matches =
      account.type === "admin"
        ? session.accountType === "admin" && session.adminEmail === account.email
        : session.accountType === "client" && session.clientId === account.clientId;
    if (!matches || session.revokedAt) return session;
    return { ...session, revokedAt };
  });
}
