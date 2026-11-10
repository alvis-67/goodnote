import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FILE_RULES, MAX_FILE_BYTES, STORAGE_BUCKET } from "./files";
import { statusTransitions } from "./domain";

const sql = readFileSync(new URL("../supabase/migrations/20261110160000_init.sql", import.meta.url), "utf8");

test("the database enforces the same status flow and upload limits as the app", () => {
  for (const [from, to] of statusTransitions()) {
    assert.match(sql, new RegExp(`old\\.status = '${from}' and new\\.status = '${to}'`));
  }
  assert.match(sql, new RegExp(String(MAX_FILE_BYTES)));
  assert.match(sql, new RegExp(`'${STORAGE_BUCKET}'`));
  for (const rule of FILE_RULES) {
    assert.match(sql, new RegExp(rule.mime.replaceAll(".", "\\.")));
  }
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /x-client-token/);
  assert.match(sql, /'email'/);
});
