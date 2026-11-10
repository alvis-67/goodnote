import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FILE_RULES, MAX_FILE_BYTES, STORAGE_BUCKET } from "./files";
import { STATUSES } from "./domain";
import { MAX_WORK_LOCATION_LENGTH } from "./work-location";

const sql = readFileSync(new URL("../db/migrations/0001_init.sql", import.meta.url), "utf8");
const accounts = readFileSync(new URL("../db/migrations/0002_accounts.sql", import.meta.url), "utf8");
const statusSql = readFileSync(new URL("../db/migrations/0003_request_status.sql", import.meta.url), "utf8");
const locationSql = readFileSync(new URL("../db/migrations/0004_work_location.sql", import.meta.url), "utf8");
const chainSql = readFileSync(new URL("../db/migrations/0005_document_chain.sql", import.meta.url), "utf8");
const stageSql = readFileSync(new URL("../db/migrations/0006_request_stage.sql", import.meta.url), "utf8");
const schemaScript = readFileSync(new URL("../scripts/test-schema.sh", import.meta.url), "utf8");
const neonConfig = readFileSync(new URL("../neon.ts", import.meta.url), "utf8");
const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
const legacy = readFileSync(new URL("../app/c/[[...slug]]/page.tsx", import.meta.url), "utf8");
const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const passwordScript = readFileSync(new URL("../scripts/set-admin-password.ts", import.meta.url), "utf8");

test("the database enforces upload limits and does not touch neon auth", () => {
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

test("status can move between any of the four values", () => {
  assert.match(statusSql, /create or replace function private\.enforce_request_update/);
  assert.doesNotMatch(statusSql, /old\.status = 'pending' and new\.status = 'in_progress'/);
  for (const status of STATUSES) {
    assert.match(statusSql, new RegExp(`'${status.id}'`));
  }
  assert.match(schemaScript, /db\/migrations\/\*\.sql/);
});

test("work location is optional on old rows and limited to 120 characters", () => {
  assert.match(locationSql, /add column work_location text/);
  assert.match(locationSql, /work_location is null/);
  assert.match(locationSql, new RegExp(`between 1 and ${MAX_WORK_LOCATION_LENGTH}`));
  assert.match(locationSql, /r\.work_location/);
  assert.doesNotMatch(locationSql, /work_location text not null/i);
  assert.doesNotMatch(locationSql, /postgres:\/\//i);
  assert.doesNotMatch(locationSql, /password_hash/i);
  assert.doesNotMatch(locationSql, /insert\s+into/i);
});

test("a document chain is optional and only quotation to invoice to receipt", () => {
  assert.match(chainSql, /add column parent_request_id uuid/);
  assert.match(chainSql, /parent_request_id is null or parent_request_id <> id/);
  assert.match(chainSql, /on delete set null/);
  assert.match(chainSql, /requests_one_child_idx/);
  assert.match(chainSql, /parent\.topic = 'quote' and new\.topic = 'invoice'/);
  assert.match(chainSql, /parent\.topic = 'invoice' and new\.topic = 'receipt'/);
  assert.match(chainSql, /r\.parent_request_id/);
  assert.match(chainSql, /child\.id as child_request_id/);
  assert.doesNotMatch(chainSql, /parent\.topic = 'quote' and new\.topic = 'receipt'/);
  assert.doesNotMatch(chainSql, /parent_request_id uuid not null/i);
  assert.doesNotMatch(chainSql, /insert\s+into/i);
  assert.doesNotMatch(chainSql, /postgres:\/\//i);
  assert.doesNotMatch(chainSql, /password_hash/i);
  assert.doesNotMatch(chainSql, /neon_auth\./);
});

test("a request stage stays on the same row and only moves one step forward", () => {
  assert.match(stageSql, /add column stage text/);
  assert.match(stageSql, /set stage = topic/);
  assert.match(stageSql, /new\.topic is distinct from old\.topic/);
  assert.match(stageSql, /old\.topic = 'quote' and old\.stage = 'quote' and new\.stage = 'invoice'/);
  assert.match(stageSql, /old\.topic = 'quote' and old\.stage = 'invoice' and new\.stage = 'receipt'/);
  assert.match(stageSql, /old\.topic = 'invoice' and old\.stage = 'invoice' and new\.stage = 'receipt'/);
  assert.match(stageSql, /new\.status := 'pending'/);
  assert.match(stageSql, /new\.admin_unread := true/);
  assert.match(stageSql, /kind = 'stage_change'/);
  assert.match(stageSql, /when topic = 'quote' and stage = 'quote' then '出報價單'/);
  assert.match(stageSql, /when topic = 'quote' and stage = 'invoice' then '已出報價單，請出發票'/);
  assert.match(stageSql, /when topic = 'quote' and stage = 'receipt' then '發票，已收錢，請出收據'/);
  assert.match(stageSql, /when topic = 'invoice' and stage = 'invoice' then '出發票'/);
  assert.match(stageSql, /when topic = 'invoice' and stage = 'receipt' then '發票，已收錢，請出收據'/);
  assert.match(stageSql, /'stage_changed'/);
  assert.match(stageSql, /r\.stage/);
  assert.doesNotMatch(stageSql, /old\.topic = 'quote' and old\.stage = 'quote' and new\.stage = 'receipt'/);
  assert.doesNotMatch(stageSql, /insert\s+into\s+public\.requests/i);
  assert.doesNotMatch(stageSql, /insert\s+into\s+public\.clients/i);
  assert.doesNotMatch(stageSql, /postgres:\/\//i);
  assert.doesNotMatch(stageSql, /password_hash/i);
  assert.doesNotMatch(stageSql, /neon_auth\./);
});

test("deleting a request cascades to messages, attachments, and notifications", () => {
  const cascades = sql.match(/references public\.requests \(id\) on delete cascade/g) ?? [];
  assert.equal(cascades.length, 3);
});

test("neon.ts enables auth and the private request-files bucket only", () => {
  assert.match(neonConfig, /auth:\s*true/);
  assert.match(neonConfig, new RegExp(`["']${STORAGE_BUCKET}["']`));
  assert.match(neonConfig, /access:\s*"private"/);
  assert.doesNotMatch(neonConfig, /dataApi/);
  assert.doesNotMatch(neonConfig, /aiGateway/);
});

test("client reads are scoped to the signed-in client and admin reads check the session", () => {
  assert.match(data, /where (r\.)?client_id = \$\{client\.id\}/);
  assert.match(data, /parent\.client_id = r\.client_id/);
  assert.match(data, /child\.client_id = r\.client_id/);
  assert.match(data, /requireAdmin\(/);
  assert.match(data, /password_hash is not null/);
  assert.doesNotMatch(data, /access_token/);
  for (const line of data.split("\n")) {
    if (line.includes("password_hash") && !line.includes("password_hash is not null")) {
      assert.fail(line);
    }
  }
});

test("accounts are app-owned and old token links are not a credential", () => {
  assert.match(accounts, /create table public\.sessions/);
  assert.match(accounts, /clients_login_name_key/);
  assert.match(accounts, /drop column access_token/);
  assert.match(accounts, /password_hash/);
  assert.doesNotMatch(accounts, /^\s*expires_at\b/m);
  assert.doesNotMatch(accounts, /insert\s+into/i);
  assert.doesNotMatch(accounts, /neon_auth\./);
  assert.match(legacy, /redirect\("\/client\/login"\)/);
  assert.doesNotMatch(legacy, /access_token|loadClientContext|listClientRequests|from "@\/lib\/db"/);
  assert.doesNotMatch(pkg, /@neon\/auth/);
  assert.match(passwordScript, /ADMIN_EMAIL/);
  assert.match(passwordScript, /stdin/);
  assert.doesNotMatch(passwordScript, /console\.(log|error|info)\([^)]*passwordHash/);
  assert.doesNotMatch(passwordScript, /password\s*=\s*["'][^"']+["']/);
});
