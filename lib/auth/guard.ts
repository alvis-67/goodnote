import { normalizeEmail } from "@/lib/auth/email";

export type AuthRouteDecision =
  | { action: "pass" }
  | { action: "reject"; status: 400 | 403; error: string }
  | { action: "allowlist"; email: string };

const ALLOWLIST_POSTS = new Set([
  "sign-in/magic-link",
  "sign-in/email-otp",
  "email-otp/send-verification-otp",
  "email-otp/verify-email",
  "email-otp/check-verification-otp",
]);

const OPEN_POSTS = new Set(["sign-out"]);

export function authRouteKey(pathname: string): string {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const marker = "/api/auth/";
  const index = path.indexOf(marker);
  const suffix = index >= 0 ? path.slice(index + marker.length) : path.replace(/^\/+/, "");
  return suffix;
}

function emailFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("email" in body)) return null;
  return normalizeEmail((body as { email?: unknown }).email);
}

// Public self-signup is closed on this app's auth proxy. Password sign-in is
// closed too. Email OTP and magic link continue only when the address is on
// admin_allowlist. The desk checks that list again after a session exists.
export function decideAuthRoute(method: string, pathname: string, body: unknown): AuthRouteDecision {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return { action: "pass" };
  if (verb !== "POST" && verb !== "PUT" && verb !== "PATCH" && verb !== "DELETE") {
    return { action: "reject", status: 403, error: "不支援這個操作。" };
  }

  const key = authRouteKey(pathname);
  if (OPEN_POSTS.has(key)) return { action: "pass" };
  if (!ALLOWLIST_POSTS.has(key)) {
    return { action: "reject", status: 403, error: "註冊未開放。請使用已獲授權的電郵登入。" };
  }

  const email = emailFromBody(body);
  if (!email) return { action: "reject", status: 400, error: "請輸入有效的電郵地址。" };
  return { action: "allowlist", email };
}
