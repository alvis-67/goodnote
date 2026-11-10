import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { sql } from "@/lib/db";
import { hasDatabaseEnv, hasSessionEnv, sessionSecret } from "@/lib/env";
import { asNumber, asText } from "@/lib/rows";
import { hashSessionToken, newSessionToken } from "@/lib/auth/session-token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/routes";

export type ClientPrincipal = {
  id: string;
  companyName: string;
  contactName: string | null;
  phone: string | null;
  unread: number;
};

export type Principal =
  | { kind: "admin"; email: string }
  | { kind: "client"; client: ClientPrincipal };

async function presentedToken(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  if (token.length < 40 || token.length > 200) return null;
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

async function revokeTokenHash(tokenHash: string): Promise<void> {
  await sql()`
    update sessions
    set revoked_at = now()
    where token_hash = ${tokenHash}
      and revoked_at is null
  `;
}

export async function destroyCurrentSession(): Promise<void> {
  if (hasDatabaseEnv() && hasSessionEnv()) {
    const token = await presentedToken();
    if (token) {
      try {
        await revokeTokenHash(hashSessionToken(token, sessionSecret()));
      } catch (error) {
        console.error("session revoke failed", error instanceof Error ? error.name : "error");
      }
    }
  }
  await clearSessionCookie();
}

async function issueSession(insert: (tokenHash: string) => Promise<boolean>): Promise<boolean> {
  if (!hasSessionEnv()) return false;
  const token = newSessionToken();
  const tokenHash = hashSessionToken(token, sessionSecret());
  const stored = await insert(tokenHash);
  if (!stored) return false;
  const existing = await presentedToken();
  if (existing) {
    const existingHash = hashSessionToken(existing, sessionSecret());
    if (existingHash !== tokenHash) {
      try {
        await revokeTokenHash(existingHash);
      } catch (error) {
        console.error("session revoke failed", error instanceof Error ? error.name : "error");
      }
    }
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  return true;
}

export async function startAdminSession(email: string, passwordHash: string): Promise<boolean> {
  return issueSession(async (tokenHash) => {
    const rows = await sql()`
      insert into sessions (token_hash, account_type, admin_email, credential_at)
      select ${tokenHash}, 'admin', email, password_changed_at
      from admin_allowlist
      where email = ${email}
        and password_hash = ${passwordHash}
        and password_changed_at is not null
      returning id
    `;
    return Boolean(rows[0]?.id);
  });
}

export async function startClientSession(clientId: string, passwordHash: string): Promise<boolean> {
  return issueSession(async (tokenHash) => {
    const rows = await sql()`
      insert into sessions (token_hash, account_type, client_id, credential_at)
      select ${tokenHash}, 'client', id, password_changed_at
      from clients
      where id = ${clientId}
        and password_hash = ${passwordHash}
        and password_changed_at is not null
      returning id
    `;
    return Boolean(rows[0]?.id);
  });
}

export const readSession = cache(async (): Promise<Principal | null> => {
  if (!hasDatabaseEnv() || !hasSessionEnv()) return null;
  const token = await presentedToken();
  if (!token) return null;
  const tokenHash = hashSessionToken(token, sessionSecret());
  const rows = await sql()`
    select
      s.account_type,
      s.admin_email,
      s.client_id,
      c.company_name,
      c.contact_name,
      c.phone,
      (
        select count(*)::int
        from requests
        where requests.client_id = c.id
          and requests.client_unread = true
      ) as unread
    from sessions s
    left join admin_allowlist a
      on s.account_type = 'admin' and a.email = s.admin_email
    left join clients c
      on s.account_type = 'client' and c.id = s.client_id
    where s.token_hash = ${tokenHash}
      and s.revoked_at is null
      and (
        (
          s.account_type = 'admin'
          and a.password_hash is not null
          and s.credential_at = a.password_changed_at
        )
        or (
          s.account_type = 'client'
          and c.password_hash is not null
          and s.credential_at = c.password_changed_at
        )
      )
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.account_type === "admin") {
    const email = asText(row.admin_email);
    if (!email) return null;
    return { kind: "admin", email };
  }
  if (row.account_type === "client") {
    const id = asText(row.client_id);
    const companyName = asText(row.company_name);
    if (!id || !companyName) return null;
    return {
      kind: "client",
      client: {
        id,
        companyName,
        contactName: asText(row.contact_name),
        phone: asText(row.phone),
        unread: asNumber(row.unread),
      },
    };
  }
  return null;
});
