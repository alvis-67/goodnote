"use server";

import { redirect } from "next/navigation";

import { emailFromClaims, isAllowlisted } from "@/lib/auth";
import { hasPublicEnv } from "@/lib/env-public";
import { requestOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { createSecretClient, hasSecretEnv } from "@/lib/supabase/secret";

export type AuthResult = { ok: true } | { ok: false; error: string };

function normalizeEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200) return null;
  return value;
}

export async function sendAdminLoginCode(email: string): Promise<AuthResult> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "請輸入有效的電郵地址。" };
  if (!hasPublicEnv() || !hasSecretEnv()) return { ok: false, error: "系統尚未完成設定。" };

  const secret = createSecretClient();
  const { data: allowed, error: allowError } = await secret
    .from("admin_allowlist")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();
  if (allowError) return { ok: false, error: "暫時未能核對管理員名單，請稍後再試。" };
  if (!allowed) return { ok: false, error: "這個電郵不在管理員允許清單內。" };

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("rate") || error.status === 429) {
      return { ok: false, error: "嘗試次數太多，請稍後再試。" };
    }
    if (
      message.includes("not found") ||
      message.includes("signups not allowed") ||
      message.includes("user not allowed") ||
      message.includes("signups")
    ) {
      return { ok: false, error: "這個電郵尚未建立登入帳戶。請先在 Supabase 建立使用者。" };
    }
    console.error("signInWithOtp failed", error.code);
    return { ok: false, error: "未能送出登入電郵，請稍後再試。" };
  }
  return { ok: true };
}

export async function verifyAdminLoginCode(email: string, code: string): Promise<AuthResult> {
  const normalized = normalizeEmail(email);
  const token = code.trim();
  if (!normalized) return { ok: false, error: "請輸入有效的電郵地址。" };
  if (!/^\d{6,10}$/.test(token)) return { ok: false, error: "請輸入電郵內的數字驗證碼。" };
  if (!hasPublicEnv()) return { ok: false, error: "系統尚未完成設定。" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: normalized,
    token,
    type: "email",
  });
  if (error) return { ok: false, error: "驗證碼不正確或已過期。" };

  const { data } = await supabase.auth.getClaims();
  const claimEmail = emailFromClaims(data?.claims);
  if (!claimEmail || !(await isAllowlisted(supabase, claimEmail))) {
    await supabase.auth.signOut();
    return { ok: false, error: "這個帳戶沒有管理員權限。" };
  }
  redirect("/admin");
}
