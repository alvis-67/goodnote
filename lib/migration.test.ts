import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FILE_RULES, MAX_FILE_BYTES, STORAGE_BUCKET } from "./files";
import { statusTransitions } from "./domain";

const sql = readFileSync(new URL("../db/migrations/0001_init.sql", import.meta.url), "utf8");
const neonConfig = readFileSync(new URL("../neon.ts", import.meta.url), "utf8");
const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");

test("the database enforces the same status flow and upload limits as the app", () => {
  for (const [from, to] of statusTransitions()) {
    assert.match(sql, new RegExp(`old\\.status = '${from}' and new\\.status = '${to}'`));
  }
  assert.match(sql, new RegExp(String(MAX_FILE_BYTES)));
  for (const rule of FILE_RULES) {
    assert.match(sql, new RegExp(rule.mime.replaceAll(".", "\\.")));
  }
  assert.match(sql, /admin_allowlist/);
  assert.match(sql, /'email'/);
  assert.match(sql, /'whatsapp'/);
  assert.doesNotMatch(sql, /auth\.jwt/);
  assert.doesNotMatch(sql, /neon_auth\./);
  assert.doesNotMatch(sql, /storage\.buckets/);
});

test("neon.ts enables auth and the private request-files bucket only", () => {
  assert.match(neonConfig, /auth:\s*true/);
  assert.match(neonConfig, new RegExp(`["']${STORAGE_BUCKET}["']`));
  assert.match(neonConfig, /access:\s*"private"/);
  assert.doesNotMatch(neonConfig, /dataApi/);
  assert.doesNotMatch(neonConfig, /aiGateway/);
});

test("client reads are scoped by the access token and admin reads check the session", () => {
  assert.match(data, /where access_token = \$\{token\}/);
  assert.match(data, /requireAdmin\(/);
  assert.doesNotMatch(data, /select[^;]*notes[^;]*access_token = \$\{token\}/);
});
