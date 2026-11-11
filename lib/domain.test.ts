import assert from "node:assert/strict";
import test from "node:test";

import { STATUSES, canAssignStatus, isDeleteConfirmed, statusAssignments } from "./domain";

test("an admin can assign any status from any current status", () => {
  const ids = STATUSES.map((status) => status.id);
  assert.deepEqual(
    ids,
    ["pending", "recorded", "completed"],
  );
  assert.equal(statusAssignments().length, ids.length * (ids.length - 1));
  for (const from of ids) {
    for (const to of ids) {
      assert.equal(canAssignStatus(from, to), true, `${from} -> ${to}`);
    }
  }
  assert.equal(canAssignStatus("pending", "closed"), false);
  assert.equal(canAssignStatus("closed", "pending"), false);
  assert.equal(canAssignStatus("", "pending"), false);
});

test("delete does nothing unless the admin confirms", () => {
  assert.equal(isDeleteConfirmed("yes"), true);
  assert.equal(isDeleteConfirmed("YES"), false);
  assert.equal(isDeleteConfirmed("true"), false);
  assert.equal(isDeleteConfirmed(""), false);
  assert.equal(isDeleteConfirmed(null), false);
  assert.equal(isDeleteConfirmed(undefined), false);
});
