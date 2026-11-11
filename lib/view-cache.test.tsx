import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CachedPaintView } from "../components/cached-screen";
import { stageAdvanceError } from "./request-stage";
import {
  adoptScope,
  adminCacheKey,
  beginOptimistic,
  clearViewCache,
  memoryViewStorage,
  paintCachedView,
  rememberAdminDetail,
  rememberAdminList,
  rememberClientDetail,
  rememberClientList,
  rememberProvisionalClientRequest,
  settleOptimistic,
  takeMutationFailure,
  toCachedAdminRow,
  toCachedClientRequest,
  type CachedAdminDetail,
  type CachedClientDetail,
  type CachedClientRequest,
} from "./view-cache";

const clientA = "11111111-1111-4111-8111-111111111111";
const clientB = "22222222-2222-4222-8222-222222222222";
const requestA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const requestB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const scopeA = { role: "client" as const, accountId: clientA };
const scopeB = { role: "client" as const, accountId: clientB };
const adminScope = { role: "admin" as const, accountId: "owner@example.com" };

function clientRequest(id: string, clientId: string, status: CachedClientRequest["status"] = "pending"): CachedClientRequest {
  return toCachedClientRequest({
    id,
    client_id: clientId,
    topic: "quote",
    stage: "quote",
    status,
    work_location: "九龍灣地盤",
    created_at: "2026-11-10T02:00:00.000Z",
    last_activity_at: "2026-11-10T02:00:00.000Z",
    client_unread: false,
    parent: null,
    child: null,
  });
}

function detailFor(request: CachedClientRequest, body: string): CachedClientDetail {
  return {
    savedAt: 1,
    request,
    messages: [
      {
        id: `message-${request.id}`,
        author_role: "client",
        kind: "message",
        body,
        created_at: request.created_at,
      },
    ],
    files: [],
  };
}

test("logout clears cached requests so the next paint is empty", () => {
  const storage = memoryViewStorage();
  const request = clientRequest(requestA, clientA);
  rememberClientList(storage, scopeA, [request]);
  rememberClientDetail(storage, scopeA, detailFor(request, "甲公司的報價"));
  assert.equal(paintCachedView(storage, "/client", "", "client").kind, "client-list");

  clearViewCache(storage);

  assert.deepEqual(paintCachedView(storage, "/client", "", "client"), {
    kind: "pending",
    title: "我的請求",
    label: "正在載入…",
  });
  assert.equal(paintCachedView(storage, `/client/requests/${requestA}`, "", "client").kind, "pending");
  assert.equal(takeMutationFailure(storage), null);
});

test("switching accounts drops the previous account before anything is painted", () => {
  const storage = memoryViewStorage();
  const first = clientRequest(requestA, clientA);
  const second = clientRequest(requestB, clientB);
  rememberClientList(storage, scopeA, [first]);
  rememberClientDetail(storage, scopeA, detailFor(first, "甲公司的內容"));

  adoptScope(storage, scopeB);
  const cleared = paintCachedView(storage, "/client", "", "client");
  assert.equal(cleared.kind, "pending");
  assert.equal(JSON.stringify(cleared).includes("甲公司"), false);
  assert.equal(JSON.stringify(cleared).includes(requestA), false);

  rememberClientList(storage, scopeB, [second]);
  const painted = paintCachedView(storage, "/client", "", "client");
  assert.equal(painted.kind, "client-list");
  if (painted.kind === "client-list") {
    assert.deepEqual(
      painted.requests.map((item) => item.id),
      [requestB],
    );
    assert.equal(painted.requests.some((item) => item.client_id === clientA), false);
  }

  adoptScope(storage, scopeA);
  assert.equal(paintCachedView(storage, "/client", "", "client").kind, "pending");
});

test("a client cache cannot show an admin record, even when the account id text matches", () => {
  const storage = memoryViewStorage();
  const detail: CachedAdminDetail = {
    savedAt: 1,
    request: clientRequest(requestA, clientA),
    company_name: "甲工程公司",
    contact_name: "陳先生",
    phone: "90000000",
    notes: "內部備註不可外洩",
    messages: [],
    files: [],
  };
  rememberAdminDetail(storage, adminScope, detail);
  rememberAdminList(storage, adminScope, "/admin", {
    rows: [
      toCachedAdminRow({
        id: requestA,
        client_id: clientA,
        company_name: "甲工程公司",
        topic: "quote",
        stage: "quote",
        status: "pending",
        work_location: "九龍灣地盤",
        last_activity_at: "2026-11-10T02:00:00.000Z",
        latest_body: "內部備註不可外洩",
        admin_unread: true,
        admin_last_read_at: null,
        parent_request_id: null,
        parent_topic: null,
        child_request_id: null,
        child_topic: null,
      }),
    ],
    clients: [{ id: clientA, company_name: "甲工程公司" }],
  });

  const asClient = paintCachedView(storage, "/client", "", "client");
  assert.equal(asClient.kind, "pending");
  assert.equal(JSON.stringify(asClient).includes("內部備註"), false);
  assert.equal(paintCachedView(storage, `/client/requests/${requestA}`, "", "client").kind, "pending");

  adoptScope(storage, { role: "client", accountId: adminScope.accountId });
  assert.equal(paintCachedView(storage, "/admin", "", "admin").kind, "pending");
  assert.equal(JSON.stringify(paintCachedView(storage, "/admin", "", "admin")).includes("甲工程公司"), false);
});

test("a failed status write after the list already shows the new status reverts it", () => {
  const storage = memoryViewStorage();
  const row = toCachedAdminRow({
    id: requestA,
    client_id: clientA,
    company_name: "甲工程公司",
    topic: "quote",
    stage: "quote",
    status: "pending",
    work_location: "九龍灣地盤",
    last_activity_at: "2026-11-10T02:00:00.000Z",
    latest_body: "請出報價",
    admin_unread: false,
    admin_last_read_at: "2026-11-10T02:00:00.000Z",
    parent_request_id: null,
    parent_topic: null,
    child_request_id: null,
    child_topic: null,
  });
  rememberAdminList(storage, adminScope, adminCacheKey({}), { rows: [row], clients: [] });
  rememberAdminDetail(storage, adminScope, {
    savedAt: 1,
    request: clientRequest(requestA, clientA, "pending"),
    company_name: "甲工程公司",
    contact_name: null,
    phone: null,
    notes: null,
    messages: [],
    files: [],
  });

  beginOptimistic(storage, adminScope, requestA, { status: "pending", stage: "quote" }, { status: "completed", stage: "quote" });
  const moved = paintCachedView(storage, "/admin", "", "admin");
  assert.equal(moved.kind, "admin-list");
  if (moved.kind === "admin-list") assert.equal(moved.rows[0]?.status, "completed");
  const movedDetail = paintCachedView(storage, `/admin/requests/${requestA}`, "", "admin");
  assert.equal(movedDetail.kind, "admin-detail");
  if (movedDetail.kind === "admin-detail") assert.equal(movedDetail.detail.request.status, "completed");

  const settled = settleOptimistic(storage, adminScope, requestA, { ok: false, error: "狀態未能更新。" });
  assert.deepEqual(settled, { ok: false, error: "狀態未能更新。" });
  const restored = paintCachedView(storage, "/admin", "", "admin");
  assert.equal(restored.kind, "admin-list");
  if (restored.kind === "admin-list") assert.equal(restored.rows[0]?.status, "pending");
  const restoredDetail = paintCachedView(storage, `/admin/requests/${requestA}`, "", "admin");
  if (restoredDetail.kind === "admin-detail") assert.equal(restoredDetail.detail.request.status, "pending");
  assert.equal(takeMutationFailure(storage), "狀態未能更新。");
  assert.equal(takeMutationFailure(storage), null);
});

test("a failed stage change after the detail already moved returns to the previous stage", () => {
  const storage = memoryViewStorage();
  const request = clientRequest(requestA, clientA, "recorded");
  rememberClientList(storage, scopeA, [request]);
  rememberClientDetail(storage, scopeA, detailFor(request, "報價已接受"));

  beginOptimistic(storage, scopeA, requestA, { status: "recorded", stage: "quote" }, { status: "pending", stage: "invoice" });
  const moved = paintCachedView(storage, `/client/requests/${requestA}`, "", "client");
  assert.equal(moved.kind, "client-detail");
  if (moved.kind === "client-detail") {
    assert.equal(moved.detail.request.stage, "invoice");
    assert.equal(moved.detail.request.status, "pending");
  }

  const settled = settleOptimistic(storage, scopeA, requestA, { ok: false, error: stageAdvanceError() });
  assert.equal(settled.ok, false);
  if (!settled.ok) assert.equal(settled.error, "未能進入下一階段。");
  const restored = paintCachedView(storage, `/client/requests/${requestA}`, "", "client");
  if (restored.kind === "client-detail") {
    assert.equal(restored.detail.request.stage, "quote");
    assert.equal(restored.detail.request.status, "recorded");
  }
  const list = paintCachedView(storage, "/client", "", "client");
  if (list.kind === "client-list") assert.equal(list.requests[0]?.status, "recorded");
});

test("a refresh does not hide an optimistic status that the server has not confirmed", () => {
  const storage = memoryViewStorage();
  const row = toCachedAdminRow({
    id: requestA,
    client_id: clientA,
    company_name: "甲工程公司",
    topic: "quote",
    stage: "quote",
    status: "pending",
    work_location: null,
    last_activity_at: "2026-11-10T02:00:00.000Z",
    latest_body: "舊內容",
    admin_unread: false,
    admin_last_read_at: "2026-11-10T02:00:00.000Z",
    parent_request_id: null,
    parent_topic: null,
    child_request_id: null,
    child_topic: null,
  });
  rememberAdminList(storage, adminScope, "/admin", { rows: [row], clients: [] });
  beginOptimistic(storage, adminScope, requestA, { status: "pending", stage: "quote" }, { status: "recorded", stage: "quote" });
  rememberAdminList(storage, adminScope, "/admin", {
    rows: [{ ...row, latest_body: "伺服器上的新摘錄", status: "pending" }],
    clients: [],
  });
  const painted = paintCachedView(storage, "/admin", "", "admin");
  assert.equal(painted.kind, "admin-list");
  if (painted.kind === "admin-list") {
    assert.equal(painted.rows[0]?.status, "recorded");
    assert.equal(painted.rows[0]?.latest_body, "伺服器上的新摘錄");
  }
});

test("a provisional request can paint before the detail page arrives, and a later failure removes that story", () => {
  const storage = memoryViewStorage();
  rememberProvisionalClientRequest(storage, scopeA, {
    requestId: requestA,
    topic: "invoice",
    workLocation: "觀塘地盤",
    body: "請開發票",
    files: [],
    createdAt: "2026-11-11T01:00:00.000Z",
  });
  const painted = paintCachedView(storage, `/client/requests/${requestA}`, "", "client");
  assert.equal(painted.kind, "client-detail");
  if (painted.kind === "client-detail") {
    assert.equal(painted.detail.request.status, "pending");
    assert.equal(painted.detail.request.stage, "invoice");
    assert.equal(painted.detail.messages[0]?.body, "請開發票");
  }

  beginOptimistic(storage, scopeA, requestA, { status: "pending", stage: "invoice" }, { status: "completed", stage: "invoice" });
  settleOptimistic(storage, scopeA, requestA, { ok: false, error: "狀態未能更新。" });
  const restored = paintCachedView(storage, `/client/requests/${requestA}`, "", "client");
  if (restored.kind === "client-detail") assert.equal(restored.detail.request.status, "pending");

  adoptScope(storage, scopeB);
  assert.equal(paintCachedView(storage, `/client/requests/${requestA}`, "", "client").kind, "pending");
});

test("the cached client list renders the last requests and says it is refreshing", () => {
  const html = renderToStaticMarkup(
    createElement(CachedPaintView, {
      role: "client",
      paint: { kind: "client-list", requests: [clientRequest(requestA, clientA)] },
    }),
  );
  assert.match(html, /我的請求/);
  assert.match(html, /正在更新…/);
  assert.match(html, /出報價單/);
  assert.match(html, /九龍灣地盤/);
  assert.match(html, new RegExp(`/client/requests/${requestA}`));
  assert.doesNotMatch(html, /內部備註/);
});

test("logout, password change, and login clear the view cache", () => {
  const signOut = readFileSync(new URL("../components/sign-out-form.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../components/login-form.tsx", import.meta.url), "utf8");
  const password = readFileSync(new URL("../components/change-password-form.tsx", import.meta.url), "utf8");
  const live = readFileSync(new URL("../components/live-request.tsx", import.meta.url), "utf8");
  assert.match(signOut, /clearViewCache\(browserViewStorage\(\)\)/);
  assert.match(login, /clearViewCache\(browserViewStorage\(\)\)/);
  assert.match(password, /clearViewCache\(browserViewStorage\(\)\)/);
  assert.match(live, /settleOptimistic\(/);
  assert.match(live, /狀態未能更新。/);
  assert.match(live, /setView\(previous\)/);
});

test("request pages load their queries together and the thread does not wait in line", () => {
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
  const inbox = data.slice(data.indexOf("export async function loadAdminInbox"), data.indexOf("export async function getAdminRequest"));
  const requestLoader = data.slice(data.indexOf("export async function getAdminRequest"), data.indexOf("export async function listAdminClients"));
  const thread = data.slice(data.indexOf("async function loadThreadFor"), data.indexOf("export async function loadClientThread"));

  assert.match(clientPage, /Promise\.all\(\[\s*getClientRequest\(id\),\s*loadClientRequestChain\(id\),\s*loadClientThread\(id\),?\s*\]\)/);
  assert.match(
    adminPage,
    /Promise\.all\(\[\s*getAdminRequest\(id\),\s*loadAdminRequestChain\(id\),\s*loadAdminThread\(id\),\s*listReplyPresets\(\),?\s*\]\)/,
  );
  assert.match(thread, /Promise\.all\(/);
  assert.match(requestLoader, /join clients c on c\.id = r\.client_id/);
  assert.match(requestLoader, /\(c\.password_hash is not null\) as has_password/);
  assert.doesNotMatch(inbox, /admin_unread = true/);
  assert.doesNotMatch(requestLoader, /password_hash,/);
});
