import { normalizeEmail } from "@/lib/auth/email";

export type OtpLoginResult = "redirect" | "invalid" | "forbidden";

type AuthUser = { email?: string | null } | null | undefined;

/**
 * Email from a Neon Auth payload.
 *
 * `signIn.emailOtp` returns `{ token, user }`. `getSession()` returns
 * `{ data: { session, user } | null, error }`, so the caller passes `data`
 * and the email is on `user`, not under `session`.
 */
export function emailFromAuthPayload(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as {
    user?: AuthUser;
    session?: { user?: AuthUser } | null;
  };
  return normalizeEmail(record.user?.email ?? record.session?.user?.email ?? null);
}

/**
 * What to do after `signIn.emailOtp` returns inside the same Server Action.
 *
 * The Next.js adapter writes the new session with `cookies().set`, but
 * `getSession()` reads only the incoming `Cookie` header. That session is
 * often invisible until the next request, and signing out would delete it.
 * The sign-in response already names the user. When it does not, an empty
 * same-turn session is not a permission failure: the submitted address was
 * checked against `admin_allowlist` before the code was accepted.
 * `requireAdmin` still checks the cookie on the following request.
 */
export function settleAdminOtpLogin(input: {
  otpFailed: boolean;
  submittedAllowlisted: boolean;
  signedInEmail: string | null;
  signedInAllowlisted: boolean;
  sessionEmail: string | null;
  sessionAllowlisted: boolean;
}): OtpLoginResult {
  if (input.otpFailed) return "invalid";
  if (input.signedInEmail) return input.signedInAllowlisted ? "redirect" : "forbidden";
  if (input.sessionEmail) return input.sessionAllowlisted ? "redirect" : "forbidden";
  return input.submittedAllowlisted ? "redirect" : "forbidden";
}
