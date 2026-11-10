import assert from "node:assert/strict";
import test from "node:test";

import { nextStatus, statusTransitions } from "./domain";

test("status only moves one step forward", () => {
  assert.deepEqual(statusTransitions(), [
    ["pending", "in_progress"],
    ["in_progress", "issued"],
    ["issued", "recorded"],
  ]);
  assert.equal(nextStatus("pending"), "in_progress");
  assert.equal(nextStatus("recorded"), null);
});
