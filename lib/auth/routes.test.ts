import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_MAX_AGE_SECONDS,
  gateRequest,
  isSessionActive,
  revokeSessionsForAccount,
  sessionCookieOptions,
  type StoredSession,
} from "./routes";
import { hashSessionToken, newSessionToken, sessionTokenMatches } from "./session-token";

const secret = "test-only-session-secret-32chars-min";

test("the session cookie is httpOnly, secure, and kept far longer than a week", () => {
  const cookie = sessionCookieOptions();
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.maxAge, SESSION_MAX_AGE_SECONDS);
  assert.ok(SESSION_MAX_AGE_SECONDS >= 60 * 60 * 24 * 365);
});

test("a session stays valid after a long max-age and is not idle-expired", () => {
  const createdAt = new Date("2010-01-01T00:00:00.000Z");
  const now = new Date(createdAt.getTime() + (SESSION_MAX_AGE_SECONDS + 60 * 60 * 24 * 365) * 1000);
  assert.equal(
    isSessionActive({
      revokedAt: null,
      credentialAt: "2026-01-01T00:00:00.000Z",
      passwordChangedAt: "2026-01-01T00:00:00.000Z",
      createdAt,
      now,
    }),
    true,
  );
});

test("changing a password revokes that account's sessions and leaves the other account signed in", () => {
  const sessions: StoredSession[] = [
    {
      id: "admin-session",
      accountType: "admin",
      adminEmail: "alvis@alvis.hk",
      clientId: null,
      createdAt: "2010-01-01T00:00:00.000Z",
      credentialAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
    },
    {
      id: "client-session",
      accountType: "client",
      adminEmail: null,
      clientId: "client-chan",
      createdAt: "2010-01-01T00:00:00.000Z",
      credentialAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
    },
  ];
  const revokedAt = "2026-11-10T00:00:00.000Z";
  const next = revokeSessionsForAccount(sessions, { type: "admin", email: "alvis@alvis.hk" }, revokedAt);
  const admin = next.find((session) => session.id === "admin-session");
  const client = next.find((session) => session.id === "client-session");
  assert.equal(admin?.revokedAt, revokedAt);
  assert.equal(client?.revokedAt, null);
  assert.equal(
    isSessionActive({
      revokedAt: admin?.revokedAt ?? null,
      credentialAt: "2026-01-01T00:00:00.000Z",
      passwordChangedAt: revokedAt,
      createdAt: new Date("2010-01-01T00:00:00.000Z"),
      now: new Date("2026-11-10T12:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isSessionActive({
      revokedAt: null,
      credentialAt: revokedAt,
      passwordChangedAt: revokedAt,
      createdAt: new Date("2026-11-10T00:00:01.000Z"),
      now: new Date("2036-11-10T00:00:00.000Z"),
    }),
    true,
  );
});

test("old client token paths never grant access", () => {
  const token = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  for (const pathname of [`/c/${token}`, `/c/${token}/requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, "/c"]) {
    assert.deepEqual(gateRequest(pathname, true), { type: "redirect", to: "/client/login" });
    assert.deepEqual(gateRequest(pathname, false), { type: "redirect", to: "/client/login" });
  }
  assert.deepEqual(gateRequest("/client", false), { type: "redirect", to: "/client/login" });
  assert.deepEqual(gateRequest("/client/requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", true), {
    type: "next",
    refreshCookie: true,
  });
  assert.deepEqual(gateRequest("/admin", false), { type: "redirect", to: "/admin/login" });
});

test("session tokens are stored as hashes", () => {
  const token = newSessionToken();
  const hash = hashSessionToken(token, secret);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.equal(sessionTokenMatches(token, hash, secret), true);
  assert.equal(sessionTokenMatches(`${token}x`, hash, secret), false);
  assert.throws(() => hashSessionToken(token, "short"));
});
