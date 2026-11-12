import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FILE_RULES, MAX_FILE_BYTES, STORAGE_BUCKET } from "./files";
import { STATUSES } from "./domain";
import { DEFAULT_TOPIC_RULES, MAX_TOPIC_RULE_PHRASE_LENGTH } from "./topic-rules";
import { MAX_WORK_LOCATION_LENGTH } from "./work-location";

const sql = readFileSync(new URL("../db/migrations/0001_init.sql", import.meta.url), "utf8");
const accounts = readFileSync(new URL("../db/migrations/0002_accounts.sql", import.meta.url), "utf8");
const statusSql = readFileSync(new URL("../db/migrations/0003_request_status.sql", import.meta.url), "utf8");
const locationSql = readFileSync(new URL("../db/migrations/0004_work_location.sql", import.meta.url), "utf8");
const chainSql = readFileSync(new URL("../db/migrations/0005_document_chain.sql", import.meta.url), "utf8");
const stageSql = readFileSync(new URL("../db/migrations/0006_request_stage.sql", import.meta.url), "utf8");
const titleSql = readFileSync(new URL("../db/migrations/0007_stage_titles.sql", import.meta.url), "utf8");
const statusSetSql = readFileSync(new URL("../db/migrations/0008_request_statuses.sql", import.meta.url), "utf8");
const topicSql = readFileSync(new URL("../db/migrations/0009_topics_and_reply_presets.sql", import.meta.url), "utf8");
const ruleSql = readFileSync(new URL("../db/migrations/0010_topic_rules.sql", import.meta.url), "utf8");
const schemaScript = readFileSync(new URL("../scripts/test-schema.sh", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminRequest = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
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

test("status can move between any of the three values", () => {
  assert.match(statusSql, /create or replace function private\.enforce_request_update/);
  assert.doesNotMatch(statusSql, /old\.status = 'pending' and new\.status = 'in_progress'/);
  assert.match(sql, /status in \('pending', 'recorded', 'completed'\)/);
  assert.doesNotMatch(sql, /in_progress|'issued'/);
  assert.match(statusSetSql, /DATABASE_URL_UNPOOLED/);
  assert.match(statusSetSql, /0007_stage_titles\.sql/);
  assert.match(statusSetSql, /set status = 'pending'\s+where status = 'in_progress'/);
  assert.match(statusSetSql, /set status = 'completed'\s+where status = 'issued'/);
  assert.match(statusSetSql, /set status_from = 'pending'\s+where status_from = 'in_progress'/);
  assert.match(statusSetSql, /set status_from = 'completed'\s+where status_from = 'issued'/);
  assert.match(statusSetSql, /set status_to = 'pending'\s+where status_to = 'in_progress'/);
  assert.match(statusSetSql, /set status_to = 'completed'\s+where status_to = 'issued'/);
  assert.match(statusSetSql, /payload->>'status' = 'in_progress'/);
  assert.match(statusSetSql, /payload->>'status' = 'issued'/);
  assert.match(statusSetSql, /disable trigger requests_log_status_change/);
  assert.match(statusSetSql, /enable trigger requests_log_status_change/);
  assert.match(statusSetSql, /new\.status := 'pending'/);
  assert.match(statusSetSql, /new\.status not in \('pending', 'recorded', 'completed'\)/);
  assert.match(statusSetSql, /old\.topic = 'quote' and old\.stage = 'quote' and new\.stage = 'invoice'/);
  assert.match(statusSetSql, /old\.topic = 'quote' and old\.stage = 'invoice' and new\.stage = 'receipt'/);
  assert.match(statusSetSql, /old\.topic = 'invoice' and old\.stage = 'invoice' and new\.stage = 'receipt'/);
  assert.doesNotMatch(statusSetSql, /old\.topic = 'quote' and old\.stage = 'quote' and new\.stage = 'receipt'/);
  assert.doesNotMatch(statusSetSql, /set body/i);
  assert.doesNotMatch(statusSetSql, /update\s+(public\.)?requests\s+set\s+stage/i);
  assert.doesNotMatch(statusSetSql, /update\s+(public\.)?messages\s+set\s+body/i);
  assert.doesNotMatch(statusSetSql, /insert\s+into/i);
  assert.doesNotMatch(statusSetSql, /neon_auth\./);
  assert.doesNotMatch(statusSetSql, /postgres:\/\//i);
  assert.doesNotMatch(statusSetSql, /password/i);
  for (const status of STATUSES) {
    assert.match(statusSetSql, new RegExp(`'${status.id}'`));
    assert.match(sql, new RegExp(`'${status.id}'`));
  }
  assert.deepEqual(
    STATUSES.map((status) => status.label),
    ["待處理", "已入機", "已完成"],
  );
  assert.match(schemaScript, /db\/migrations\/\*\.sql/);
  assert.match(schemaScript, /status_migration_before\.sql/);
  assert.match(schemaScript, /status_migration_after\.sql/);
  assert.match(readme, /待處理, 已入機, or 已完成/);
  assert.match(readme, /0008_request_statuses\.sql/);
  assert.match(home, /待處理、已入機和已完成/);
  assert.match(adminRequest, /待處理、已入機或已完成/);
  for (const copy of [readme, home, adminRequest]) {
    assert.doesNotMatch(copy, /處理中|已出單/);
  }
  assert.doesNotMatch(readme, /four statuses/);
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
  assert.match(stageSql, /when topic = 'quote' and stage = 'invoice' then '出發票'/);
  assert.match(stageSql, /when topic = 'quote' and stage = 'receipt' then '已收錢，請出收據'/);
  assert.match(stageSql, /when topic = 'invoice' and stage = 'invoice' then '出發票'/);
  assert.match(stageSql, /when topic = 'invoice' and stage = 'receipt' then '已收錢，請出收據'/);
  assert.match(stageSql, /when topic = 'receipt' and stage = 'receipt' then '已收錢，請出收據'/);
  assert.match(stageSql, /'stage_changed'/);
  assert.match(stageSql, /r\.stage/);
  assert.doesNotMatch(stageSql, /old\.topic = 'quote' and old\.stage = 'quote' and new\.stage = 'receipt'/);
  assert.doesNotMatch(stageSql, /insert\s+into\s+public\.requests/i);
  assert.doesNotMatch(stageSql, /insert\s+into\s+public\.clients/i);
  assert.doesNotMatch(stageSql, /postgres:\/\//i);
  assert.doesNotMatch(stageSql, /password_hash/i);
  assert.doesNotMatch(stageSql, /neon_auth\./);
  assert.doesNotMatch(stageSql, /已出報價單，請出發票/);
  assert.doesNotMatch(stageSql, /發票，已收錢，請出收據/);
});

test("stage titles separate the invoice from the paid receipt", () => {
  assert.match(titleSql, /create or replace function private\.request_stage_title/);
  assert.match(titleSql, /DATABASE_URL_UNPOOLED/);
  assert.match(titleSql, /0006_request_stage\.sql/);
  assert.match(titleSql, /when topic = 'quote' and stage = 'quote' then '出報價單'/);
  assert.match(titleSql, /when topic = 'quote' and stage = 'invoice' then '出發票'/);
  assert.match(titleSql, /when topic = 'invoice' and stage = 'invoice' then '出發票'/);
  assert.match(titleSql, /when topic = 'quote' and stage = 'receipt' then '已收錢，請出收據'/);
  assert.match(titleSql, /when topic = 'invoice' and stage = 'receipt' then '已收錢，請出收據'/);
  assert.match(titleSql, /when topic = 'receipt' and stage = 'receipt' then '已收錢，請出收據'/);
  assert.match(titleSql, /when topic = 'other' and stage = 'other' then '其他'/);
  assert.match(titleSql, /revoke all on function private\.request_stage_title/);
  assert.doesNotMatch(titleSql, /已出報價單，請出發票/);
  assert.doesNotMatch(titleSql, /發票，已收錢，請出收據/);
  assert.doesNotMatch(titleSql, /update\s+(public\.)?messages/i);
  assert.doesNotMatch(titleSql, /update\s+(public\.)?requests/i);
  assert.doesNotMatch(titleSql, /insert\s+into/i);
  assert.doesNotMatch(titleSql, /delete\s+from/i);
  assert.doesNotMatch(titleSql, /neon_auth\./);
  assert.doesNotMatch(titleSql, /postgres:\/\//i);
  assert.doesNotMatch(titleSql, /password/i);
});

test("new topics keep the old stage paths and reply presets are shared rows", () => {
  assert.match(topicSql, /DATABASE_URL_UNPOOLED/);
  assert.match(topicSql, /0008_request_statuses\.sql/);
  assert.match(topicSql, /create or replace function private\.set_request_stage/);
  assert.match(topicSql, /create or replace function private\.enforce_request_update/);
  assert.match(topicSql, /create or replace function private\.request_stage_title/);
  assert.match(topicSql, /topic in \('quote', 'invoice', 'receipt', 'management', 'insurance', 'other'\)/);
  assert.match(topicSql, /stage in \('quote', 'invoice', 'receipt', 'management', 'insurance', 'other'\)/);
  assert.match(topicSql, /topic = 'management' and stage = 'management'/);
  assert.match(topicSql, /topic = 'insurance' and stage = 'insurance'/);
  assert.match(topicSql, /topic = 'other' and stage = 'other'/);
  assert.match(topicSql, /old\.topic = 'quote' and old\.stage = 'quote' and new\.stage = 'invoice'/);
  assert.match(topicSql, /old\.topic = 'quote' and old\.stage = 'invoice' and new\.stage = 'receipt'/);
  assert.match(topicSql, /old\.topic = 'invoice' and old\.stage = 'invoice' and new\.stage = 'receipt'/);
  assert.match(topicSql, /when topic = 'management' and stage = 'management' then '搵管理處'/);
  assert.match(topicSql, /when topic = 'insurance' and stage = 'insurance' then '買保險'/);
  assert.match(topicSql, /when topic = 'other' and stage = 'other' then '其他'/);
  assert.match(topicSql, /when topic = 'quote' and stage = 'quote' then '出報價單'/);
  assert.match(topicSql, /when topic = 'receipt' and stage = 'receipt' then '已收錢，請出收據'/);
  assert.match(topicSql, /create table public\.reply_presets/);
  assert.match(topicSql, /constraint reply_presets_body_key unique \(body\)/);
  assert.match(topicSql, /char_length\(body\) between 1 and 4000/);
  assert.match(topicSql, /new\.status not in \('pending', 'recorded', 'completed'\)/);
  assert.doesNotMatch(topicSql, /old\.topic = 'quote' and old\.stage = 'quote' and new\.stage = 'receipt'/);
  assert.doesNotMatch(topicSql, /old\.topic = 'management' and old\.stage = 'management' and new\.stage = 'invoice'/);
  assert.doesNotMatch(topicSql, /update\s+(public\.)?requests\s+set\s+(topic|stage)/i);
  assert.doesNotMatch(topicSql, /insert\s+into/i);
  assert.doesNotMatch(topicSql, /neon_auth\./);
  assert.doesNotMatch(topicSql, /postgres:\/\//i);
  assert.doesNotMatch(topicSql, /password/i);
  assert.match(readme, /0009_topics_and_reply_presets\.sql/);
  assert.match(readme, /搵管理處/);
  assert.match(readme, /買保險/);
});

test("topic rules are shared phrases and the default list is seeded", () => {
  assert.match(ruleSql, /DATABASE_URL_UNPOOLED/);
  assert.match(ruleSql, /0009_topics_and_reply_presets\.sql/);
  assert.match(ruleSql, /create table public\.topic_rules/);
  assert.match(ruleSql, /constraint topic_rules_phrase_key unique \(phrase\)/);
  assert.match(ruleSql, new RegExp(`char_length\\(phrase\\) between 1 and ${MAX_TOPIC_RULE_PHRASE_LENGTH}`));
  assert.match(ruleSql, /topic in \('quote', 'invoice', 'receipt', 'management', 'insurance', 'other'\)/);
  assert.match(ruleSql, /create index topic_rules_created_idx/);
  assert.equal("搵".codePointAt(0), 0x6435);
  assert.equal(DEFAULT_TOPIC_RULES.length, 19);
  for (const rule of DEFAULT_TOPIC_RULES) {
    assert.match(ruleSql, new RegExp(`\\('${rule.phrase}', '${rule.topic}'`));
    assert.equal(rule.phrase.includes("僱"), false);
  }
  assert.match(ruleSql, /'搵管理處', 'management'/);
  assert.doesNotMatch(ruleSql, /insert\s+into\s+public\.requests/i);
  assert.doesNotMatch(ruleSql, /insert\s+into\s+public\.clients/i);
  assert.doesNotMatch(ruleSql, /update\s+(public\.)?requests/i);
  assert.doesNotMatch(ruleSql, /neon_auth\./);
  assert.doesNotMatch(ruleSql, /postgres:\/\//i);
  assert.doesNotMatch(ruleSql, /password/i);
  assert.match(readme, /0010_topic_rules\.sql/);
  assert.match(schemaScript, /db\/migrations\/\*\.sql/);
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
