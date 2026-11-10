import assert from "node:assert/strict";
import test from "node:test";

import { generateAccessToken, isAccessToken, isUuid } from "./tokens";

test("access tokens are unguessable and url safe", () => {
  const first = generateAccessToken();
  const second = generateAccessToken();
  assert.equal(first.length, 43);
  assert.equal(isAccessToken(first), true);
  assert.notEqual(first, second);
  assert.equal(isAccessToken("short"), false);
  assert.equal(isAccessToken(`${first}&admin`), false);
});

test("request ids must be uuids", () => {
  assert.equal(isUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});
