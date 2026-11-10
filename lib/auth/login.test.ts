import assert from "node:assert/strict";
import test from "node:test";

import { visibleToClient } from "./access";
import { authenticateAdmin, authenticateClient, type AdminAccount, type ClientAccount } from "./login";
import { normalizeLoginName } from "./login-name";
import { adminLoginError } from "./messages";
import { hashPassword } from "./password";

const adminPassword = "test-password-1";
const clientPassword = "client-password-2";
const otherPassword = "other-password-3";

async function adminDirectory(): Promise<Map<string, AdminAccount>> {
  return new Map([
    [
      "alvis@alvis.hk",
      { passwordHash: await hashPassword(adminPassword), passwordChangedAt: "2026-01-01T00:00:00.000Z" },
    ],
    ["pending@example.com", { passwordHash: null, passwordChangedAt: null }],
  ]);
}

test("admin password login accepts an allowlisted account and rejects everyone else", async () => {
  const admins = await adminDirectory();
  const findAdmin = async (email: string) => admins.get(email) ?? null;

  const signedIn = await authenticateAdmin(" Alvis@Alvis.hk ", adminPassword, findAdmin);
  assert.equal(signedIn.ok, true);
  if (signedIn.ok) {
    assert.equal(signedIn.email, "alvis@alvis.hk");
    assert.equal(signedIn.passwordHash.startsWith("scrypt$"), true);
    assert.equal(signedIn.passwordHash.includes(adminPassword), false);
  }

  const outsider = await authenticateAdmin("other@example.com", adminPassword, findAdmin);
  assert.deepEqual(outsider, { ok: false, code: "not_allowlisted" });
  assert.match(adminLoginError("not_allowlisted"), /允許清單/);

  const wrong = await authenticateAdmin("alvis@alvis.hk", "wrong-password", findAdmin);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.code, "password_wrong");

  const unset = await authenticateAdmin("pending@example.com", adminPassword, findAdmin);
  assert.equal(unset.ok, false);
  if (!unset.ok) assert.equal(unset.code, "password_unset");
});

test("a client signs in with a login name and cannot see another client's requests", async () => {
  const chanHash = await hashPassword(clientPassword);
  const leeHash = await hashPassword(otherPassword);
  const clients = new Map<string, ClientAccount>([
    ["chan-co", { id: "client-chan", passwordHash: chanHash, passwordChangedAt: "2026-02-01T00:00:00.000Z" }],
    ["lee-co", { id: "client-lee", passwordHash: leeHash, passwordChangedAt: "2026-02-01T00:00:00.000Z" }],
  ]);
  const findClient = async (loginName: string) => clients.get(loginName) ?? null;
  const requests = [
    { id: "request-chan", clientId: "client-chan" },
    { id: "request-lee", clientId: "client-lee" },
  ];

  const chan = await authenticateClient(" Chan-Co ", clientPassword, findClient);
  assert.equal(chan.ok, true);
  if (!chan.ok) return;
  assert.deepEqual(
    visibleToClient(chan.clientId, requests).map((request) => request.id),
    ["request-chan"],
  );

  const lee = await authenticateClient("lee-co", otherPassword, findClient);
  assert.equal(lee.ok, true);
  if (!lee.ok) return;
  assert.deepEqual(
    visibleToClient(lee.clientId, requests).map((request) => request.id),
    ["request-lee"],
  );
  assert.equal(visibleToClient(chan.clientId, requests).some((request) => request.clientId === "client-lee"), false);

  const rejected = await authenticateClient("chan-co", otherPassword, findClient);
  assert.equal(rejected.ok, false);
  const unknown = await authenticateClient("missing-co", clientPassword, findClient);
  assert.equal(unknown.ok, false);
});

test("login names do not have to be email addresses", () => {
  assert.equal(normalizeLoginName(" 甲工程 "), "甲工程");
  assert.equal(normalizeLoginName("chan.coe"), "chan.coe");
  assert.equal(normalizeLoginName("a"), null);
  assert.equal(normalizeLoginName("has space"), null);
  assert.equal(normalizeLoginName("user@example.com"), "user@example.com");
});
