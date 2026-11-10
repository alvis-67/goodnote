import assert from "node:assert/strict";
import test from "node:test";

import { decideAuthRoute } from "./guard";

test("public signup and password sign-in are rejected", () => {
  const signup = decideAuthRoute("POST", "/api/auth/sign-up/email", {
    email: "person@example.com",
    password: "secret",
  });
  assert.equal(signup.action, "reject");
  const password = decideAuthRoute("POST", "/api/auth/sign-in/email", {
    email: "person@example.com",
    password: "secret",
  });
  assert.equal(password.action, "reject");
});

test("email OTP and magic link require an allowlist check", () => {
  for (const path of [
    "/api/auth/email-otp/send-verification-otp",
    "/api/auth/sign-in/email-otp",
    "/api/auth/sign-in/magic-link",
  ]) {
    const decision = decideAuthRoute("POST", path, { email: " Alvis@Example.com " });
    assert.deepEqual(decision, { action: "allowlist", email: "alvis@example.com" });
  }
});

test("a magic-link click is allowed through so the session can be checked afterwards", () => {
  const decision = decideAuthRoute(
    "GET",
    "/api/auth/magic-link/verify?token=abc&callbackURL=%2Fadmin",
    null,
  );
  assert.equal(decision.action, "pass");
});

test("an unknown auth post is rejected", () => {
  const decision = decideAuthRoute("POST", "/api/auth/sign-in/social", { provider: "google" });
  assert.equal(decision.action, "reject");
});
