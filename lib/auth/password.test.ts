import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, passwordError, verifyPassword } from "./password";

const STORED_HASH = /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/;

test("passwords are stored as salted scrypt hashes", async () => {
  const password = "test-password-1";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, STORED_HASH);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("other-password", first), false);
  assert.equal(await verifyPassword(password, "plaintext-password"), false);
  assert.equal(passwordError("short"), "密碼至少要 8 個字元。");
  assert.equal(passwordError(password), null);
});
