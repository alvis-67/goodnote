import { randomBytes } from "node:crypto";

import { normalizeEmail } from "@/lib/auth/email";
import { normalizeLoginName } from "@/lib/auth/login-name";
import type { AdminLoginCode, ClientLoginCode } from "@/lib/auth/messages";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type AdminAccount = {
  passwordHash: string | null;
  passwordChangedAt: string | null;
};

export type ClientAccount = {
  id: string;
  passwordHash: string | null;
  passwordChangedAt: string | null;
};

export type AdminLoginResult =
  | { ok: true; email: string; credentialAt: string; passwordHash: string }
  | { ok: false; code: AdminLoginCode };

export type ClientLoginResult =
  | { ok: true; clientId: string; credentialAt: string; passwordHash: string }
  | { ok: false; code: ClientLoginCode };

let dummyHash: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  if (!dummyHash) {
    dummyHash = hashPassword(randomBytes(32).toString("base64url"));
  }
  return dummyHash;
}

export async function authenticateAdmin(
  emailInput: string,
  password: string,
  findAdmin: (email: string) => Promise<AdminAccount | null>,
): Promise<AdminLoginResult> {
  const email = normalizeEmail(emailInput);
  if (!email) {
    await verifyPassword(password, await dummyPasswordHash());
    return { ok: false, code: "invalid_email" };
  }

  const admin = await findAdmin(email);
  if (!admin) {
    await verifyPassword(password, await dummyPasswordHash());
    return { ok: false, code: "not_allowlisted" };
  }
  if (!admin.passwordHash || !admin.passwordChangedAt) {
    await verifyPassword(password, await dummyPasswordHash());
    return { ok: false, code: "password_unset" };
  }

  const matches = await verifyPassword(password, admin.passwordHash);
  if (!matches) return { ok: false, code: "password_wrong" };
  return { ok: true, email, credentialAt: admin.passwordChangedAt, passwordHash: admin.passwordHash };
}

export async function authenticateClient(
  loginNameInput: string,
  password: string,
  findClient: (loginName: string) => Promise<ClientAccount | null>,
): Promise<ClientLoginResult> {
  const loginName = normalizeLoginName(loginNameInput);
  if (!loginName) {
    await verifyPassword(password, await dummyPasswordHash());
    return { ok: false, code: "invalid_login_name" };
  }

  const client = await findClient(loginName);
  if (!client?.passwordHash || !client.passwordChangedAt) {
    await verifyPassword(password, await dummyPasswordHash());
    return { ok: false, code: "credentials" };
  }

  const matches = await verifyPassword(password, client.passwordHash);
  if (!matches) return { ok: false, code: "credentials" };
  return {
    ok: true,
    clientId: client.id,
    credentialAt: client.passwordChangedAt,
    passwordHash: client.passwordHash,
  };
}
