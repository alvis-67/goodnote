"use server";

import { redirect } from "next/navigation";

import { isAllowlisted, sessionEmail } from "@/lib/auth";
import { normalizeEmail } from "@/lib/auth/email";
import { getAuth } from "@/lib/auth/server";
import { isDeskReady } from "@/lib/env";
import { requestOrigin } from "@/lib/origin";

export type AuthResult = { ok: true } | { ok: false; error: string };

type AuthError = { message?: string; status?: number; code?: string };

// The installed server client builds email OTP and magic link from its endpoint
// table at runtime. The published sign-in type still only lists email and social.
type PasswordlessAuth = {
  emailOtp: {
    sendVerificationOtp: (input: { email: string; type: "sign-in" }) => Promise<{ error: AuthError | null }>;
  };
  signIn: {
    emailOtp: (input: { email: string; otp: string }) => Promise<{ error: AuthError | null }>;
    magicLink: (input: { email: string; callbackURL: string }) => Promise<{ error: AuthError | null }>;
  };
  getSession: () => Promise<{ data: { user?: { email?: string | null } | null } | null; error: AuthError | null }>;
  signOut: () => Promise<unknown>;
};

function passwordlessAuth(): PasswordlessAuth {
  return getAuth() as unknown as PasswordlessAuth;
}

function mapSendError(error: AuthError): string {
  const code = (error.code ?? "").toUpperCase();
  const message = (error.message ?? "").toLowerCase();
  if (error.status === 429 || code.includes("RATE") || code.includes("TOO_MANY") || message.includes("rate")) {
    return "嘗試次數太多，請稍後再試。";
  }
  if (
    code.includes("USER_NOT_FOUND") ||
    code.includes("SIGNUP") ||
    message.includes("user not found") ||
    message.includes("sign up disabled") ||
    message.includes("signup")
  ) {
    return "這個電郵尚未可以登入。請確認管理員允許清單，以及 Neon Auth 已開啟電郵驗證碼登入。";
  }
  return "未能送出登入電郵，請稍後再試。";
}

export async function sendAdminLoginCode(email: string): Promise<AuthResult> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "請輸入有效的電郵地址。" };
  if (!isDeskReady()) return { ok: false, error: "系統尚未完成設定。" };
  if (!(await isAllowlisted(normalized))) return { ok: false, error: "這個電郵不在管理員允許清單內。" };

  const auth = passwordlessAuth();
  try {
    const otp = await auth.emailOtp.sendVerificationOtp({
      email: normalized,
      type: "sign-in",
    });
    if (otp.error) {
      console.error("sendVerificationOtp failed", otp.error.code ?? otp.error.status);
      return { ok: false, error: mapSendError(otp.error) };
    }
  } catch (error) {
    console.error("sendVerificationOtp threw", error instanceof Error ? error.name : "error");
    return { ok: false, error: "未能送出登入電郵，請稍後再試。" };
  }

  try {
    const origin = await requestOrigin();
    const link = await auth.signIn.magicLink({
      email: normalized,
      callbackURL: `${origin}/auth/confirm`,
    });
    if (link.error) {
      console.error("magic link was not sent", link.error.code ?? link.error.status);
    }
  } catch (error) {
    console.error("magic link threw", error instanceof Error ? error.name : "error");
  }

  return { ok: true };
}

export async function verifyAdminLoginCode(email: string, code: string): Promise<AuthResult> {
  const normalized = normalizeEmail(email);
  const token = code.trim();
  if (!normalized) return { ok: false, error: "請輸入有效的電郵地址。" };
  if (!/^\d{6,10}$/.test(token)) return { ok: false, error: "請輸入電郵內的數字驗證碼。" };
  if (!isDeskReady()) return { ok: false, error: "系統尚未完成設定。" };
  if (!(await isAllowlisted(normalized))) return { ok: false, error: "這個電郵不在管理員允許清單內。" };

  const auth = passwordlessAuth();
  const { error } = await auth.signIn.emailOtp({ email: normalized, otp: token });
  if (error) return { ok: false, error: "驗證碼不正確或已過期。" };

  const { data } = await auth.getSession();
  const claimEmail = sessionEmail(data?.user);
  if (!claimEmail || !(await isAllowlisted(claimEmail))) {
    await auth.signOut();
    return { ok: false, error: "這個帳戶沒有管理員權限。" };
  }
  redirect("/admin");
}
