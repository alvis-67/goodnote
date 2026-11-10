"use server";

import { redirect } from "next/navigation";

import { authenticateAdmin, authenticateClient } from "@/lib/auth/login";
import { adminLoginError, clientLoginError } from "@/lib/auth/messages";
import { destroyCurrentSession, startAdminSession, startClientSession } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { isDeskReady } from "@/lib/env";

export type AuthResult = { ok: false; error: string };

function credentialStamp(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string") return value.trim() ? value : null;
  return "set";
}

async function findAdmin(email: string) {
  const rows = await sql()`
    select password_hash, password_changed_at
    from admin_allowlist
    where email = ${email}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    passwordHash: typeof row.password_hash === "string" ? row.password_hash : null,
    passwordChangedAt: credentialStamp(row.password_changed_at),
  };
}

async function findClient(loginName: string) {
  const rows = await sql()`
    select id, password_hash, password_changed_at
    from clients
    where login_name = ${loginName}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    passwordHash: typeof row.password_hash === "string" ? row.password_hash : null,
    passwordChangedAt: credentialStamp(row.password_changed_at),
  };
}

export async function loginAdmin(_previous: AuthResult | null, formData: FormData): Promise<AuthResult | null> {
  if (!isDeskReady()) return { ok: false, error: "系統尚未完成設定。" };
  const result = await authenticateAdmin(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""), findAdmin);
  if (!result.ok) return { ok: false, error: adminLoginError(result.code) };
  const started = await startAdminSession(result.email, result.passwordHash);
  if (!started) return { ok: false, error: "登入失敗，請再試一次。" };
  redirect("/admin");
}

export async function loginClient(_previous: AuthResult | null, formData: FormData): Promise<AuthResult | null> {
  if (!isDeskReady()) return { ok: false, error: "系統尚未完成設定。" };
  const result = await authenticateClient(
    String(formData.get("loginName") ?? ""),
    String(formData.get("password") ?? ""),
    findClient,
  );
  if (!result.ok) return { ok: false, error: clientLoginError(result.code) };
  const started = await startClientSession(result.clientId, result.passwordHash);
  if (!started) return { ok: false, error: "登入失敗，請再試一次。" };
  redirect("/client");
}

export async function signOutAdmin(): Promise<void> {
  await destroyCurrentSession();
  redirect("/admin/login");
}

export async function signOutClient(): Promise<void> {
  await destroyCurrentSession();
  redirect("/client/login");
}
