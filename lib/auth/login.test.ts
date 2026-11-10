import assert from "node:assert/strict";
import test from "node:test";

import { emailFromAuthPayload, settleAdminOtpLogin } from "./login";

const allowlistedAdmin = {
  otpFailed: false,
  submittedAllowlisted: true,
  signedInEmail: "alvis@alvis.hk",
  signedInAllowlisted: true,
  sessionEmail: null,
  sessionAllowlisted: false,
};

test("reads the OTP user and the getSession user from the installed payload shapes", () => {
  assert.equal(
    emailFromAuthPayload({
      token: "issued-with-the-code",
      user: { email: "Alvis@Alvis.hk", emailVerified: true },
    }),
    "alvis@alvis.hk",
  );
  assert.equal(
    emailFromAuthPayload({
      session: { id: "session", expiresAt: "2026-12-01T00:00:00.000Z" },
      user: { email: "alvis@alvis.hk" },
    }),
    "alvis@alvis.hk",
  );
  assert.equal(emailFromAuthPayload({ session: null, user: null }), null);
  assert.equal(emailFromAuthPayload(null), null);
});

test("a valid allowlisted OTP redirects when the new session is not readable yet", () => {
  assert.equal(settleAdminOtpLogin(allowlistedAdmin), "redirect");
});

test("a stale or empty same-turn session does not override the allowlisted OTP user", () => {
  assert.equal(
    settleAdminOtpLogin({
      ...allowlistedAdmin,
      sessionEmail: "other@example.com",
      sessionAllowlisted: false,
    }),
    "redirect",
  );
});

test("a valid allowlisted OTP still redirects when neither response nor session has an email", () => {
  assert.equal(
    settleAdminOtpLogin({
      ...allowlistedAdmin,
      signedInEmail: null,
      signedInAllowlisted: false,
      sessionEmail: null,
      sessionAllowlisted: false,
    }),
    "redirect",
  );
});

test("a readable allowlisted session is accepted when the OTP body has no user", () => {
  assert.equal(
    settleAdminOtpLogin({
      ...allowlistedAdmin,
      signedInEmail: null,
      signedInAllowlisted: false,
      sessionEmail: "alvis@alvis.hk",
      sessionAllowlisted: true,
    }),
    "redirect",
  );
});

test("the account named by the OTP response is denied when it is not allowlisted", () => {
  assert.equal(
    settleAdminOtpLogin({
      ...allowlistedAdmin,
      signedInEmail: "other@example.com",
      signedInAllowlisted: false,
    }),
    "forbidden",
  );
});

test("a readable session that is not allowlisted is denied when the OTP body has no user", () => {
  assert.equal(
    settleAdminOtpLogin({
      ...allowlistedAdmin,
      signedInEmail: null,
      signedInAllowlisted: false,
      sessionEmail: "other@example.com",
      sessionAllowlisted: false,
    }),
    "forbidden",
  );
});

test("a failed OTP is an invalid code, including when no session email is readable", () => {
  assert.equal(
    settleAdminOtpLogin({
      ...allowlistedAdmin,
      otpFailed: true,
      signedInEmail: null,
      signedInAllowlisted: false,
    }),
    "invalid",
  );
});

test("an address that was not allowlisted before the OTP is not admitted without a session user", () => {
  assert.equal(
    settleAdminOtpLogin({
      ...allowlistedAdmin,
      submittedAllowlisted: false,
      signedInEmail: null,
      signedInAllowlisted: false,
    }),
    "forbidden",
  );
});
