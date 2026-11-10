import assert from "node:assert/strict";
import test from "node:test";

import { isUuid } from "./tokens";

test("request ids must be uuids", () => {
  assert.equal(isUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});
