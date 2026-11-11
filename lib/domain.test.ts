import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { STATUSES, TOPICS, canAssignStatus, filterByTopic, isDeleteConfirmed, statusAssignments } from "./domain";

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

test("topics stay in product order and 其他 is last", () => {
  assert.deepEqual(
    TOPICS.map((topic) => topic.id),
    ["quote", "invoice", "receipt", "management", "insurance", "other"],
  );
  assert.deepEqual(
    TOPICS.map((topic) => topic.label),
    ["出報價單", "出發票", "出收據", "搵管理處", "買保險", "其他"],
  );
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const filters = readFileSync(new URL("../components/desk-filters.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../components/client-request-list.tsx", import.meta.url), "utf8");
  assert.match(composer, /\{TOPICS\.map\(\(item\) =>/);
  assert.match(filters, /\{TOPICS\.map\(\(item\) =>/);
  assert.match(list, /\{TOPICS\.map\(\(item\) =>/);
});

test("the 事項 filter keeps the topic a request started as", () => {
  const rows = [
    { topic: "quote" as const, stage: "invoice" },
    { topic: "management" as const, stage: "management" },
    { topic: "insurance" as const, stage: "insurance" },
  ];
  assert.deepEqual(filterByTopic(rows, ""), rows);
  assert.deepEqual(filterByTopic(rows, "unknown"), rows);
  assert.deepEqual(filterByTopic(rows, "quote"), [rows[0]]);
  assert.deepEqual(filterByTopic(rows, "management"), [rows[1]]);
  assert.deepEqual(filterByTopic(rows, "insurance"), [rows[2]]);
});

test("delete does nothing unless the admin confirms", () => {
  assert.equal(isDeleteConfirmed("yes"), true);
  assert.equal(isDeleteConfirmed("YES"), false);
  assert.equal(isDeleteConfirmed("true"), false);
  assert.equal(isDeleteConfirmed(""), false);
  assert.equal(isDeleteConfirmed(null), false);
  assert.equal(isDeleteConfirmed(undefined), false);
});
