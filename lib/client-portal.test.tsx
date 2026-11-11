import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientRequestHeading } from "../components/client-request-heading";
import { ClientRequestList } from "../components/client-request-list";
import { WorkLocation } from "../components/work-location";
import { clientListHref, navigationAfterCreate, showNewRequest } from "./client-nav";
import type { RequestRow } from "./database.types";
import { clientHomePath, clientRequestPath } from "./paths";
import { displayWorkLocation, parseWorkLocation } from "./work-location";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const createdPath = clientRequestPath(requestId);

function request(partial: Pick<RequestRow, "id" | "topic" | "work_location">): RequestRow {
  const now = "2026-11-10T02:00:00.000Z";
  return {
    id: partial.id,
    client_id: "11111111-1111-4111-8111-111111111111",
    topic: partial.topic,
    stage: partial.topic,
    status: "pending",
    work_location: partial.work_location,
    parent_request_id: null,
    created_at: now,
    updated_at: now,
    last_activity_at: now,
    admin_unread: true,
    admin_last_read_at: null,
    client_unread: false,
    client_last_read_at: null,
  };
}

test("after creating a request, the client can open 我的請求 without signing in again", () => {
  const navigation = navigationAfterCreate(createdPath);
  assert.equal(navigation.method, "replace");
  assert.equal(navigation.href, createdPath);
  assert.equal(clientListHref(navigation.href), clientHomePath);
  assert.equal(showNewRequest(navigation.href), true);
  assert.equal(clientListHref("/client/new"), clientHomePath);
  assert.equal(clientListHref(clientHomePath), null);
  assert.equal(navigationAfterCreate("https://example.com/client/requests/" + requestId).href, clientHomePath);

  const html = renderToStaticMarkup(
    createElement(ClientRequestHeading, {
      topic: "quote",
      stage: "quote",
      status: "pending",
      createdAt: "2026-11-10T02:00:00.000Z",
      location: "九龍灣地盤",
    }),
  );
  assert.match(html, new RegExp(`href="${clientHomePath}"`));
  assert.match(html, /我的請求/);
  assert.match(html, /出報價單/);
  assert.match(html, /九龍灣地盤/);
  assert.doesNotMatch(html, /登出|\/client\/login/);

  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("../components/client-header.tsx", import.meta.url), "utf8");
  assert.match(
    composer,
    /if \(audience === "client" && mode === "create"\) \{\s*const navigation = navigationAfterCreate\(prepared\.redirectTo\);\s*window\.location\.replace\(navigation\.href\);\s*return;\s*\}/,
  );
  assert.match(header, /clientListHref\(pathname\)/);
  assert.match(header, /ClientListLink/);
  assert.match(header, /href=\{clientHomePath\}/);
  assert.doesNotMatch(header, /endsWith\("\/new"\)/);
  assert.doesNotMatch(composer, /signOut|destroyCurrentSession/);
});

test("creating a request keeps a required work location", () => {
  const parsed = parseWorkLocation("  九龍灣地盤  ");
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value, "九龍灣地盤");

  const blank = parseWorkLocation("   ");
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.match(blank.error, /請填寫工作地點/);

  const tooLong = parseWorkLocation("地".repeat(121));
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.match(tooLong.error, /120/);
  assert.equal(parseWorkLocation("地".repeat(120)).ok, true);
  assert.equal(displayWorkLocation(null), null);
  assert.equal(displayWorkLocation("  "), null);

  const action = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  assert.match(action, /parseWorkLocation\(/);
  assert.match(action, /insert into requests \(client_id, topic, work_location\)/);
  assert.match(action, /\$\{workLocation\.value\}/);
  assert.match(composer, /工作地點/);
  assert.match(composer, /parseWorkLocation\(workLocation\)/);
  assert.match(composer, /workLocation: workLocationValue/);
});

test("the request list shows each request's work location", () => {
  const html = renderToStaticMarkup(
    createElement(ClientRequestList, {
      requests: [
        request({ id: requestId, topic: "quote", work_location: "九龍灣地盤" }),
        request({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          topic: "invoice",
          work_location: null,
        }),
      ],
    }),
  );
  const items = html.split("<li").slice(1);
  assert.equal(items.length, 2);
  assert.match(items[0] ?? "", /出報價單/);
  assert.match(items[0] ?? "", /工作地點/);
  assert.match(items[0] ?? "", /九龍灣地盤/);
  assert.match(items[0] ?? "", new RegExp(`href="${createdPath}"`));
  assert.match(items[1] ?? "", /出發票/);
  assert.doesNotMatch(items[1] ?? "", /工作地點/);

  assert.equal(renderToStaticMarkup(createElement(WorkLocation, { location: null })), "");
  assert.equal(renderToStaticMarkup(createElement(WorkLocation, { location: "  " })), "");

  const detail = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(detail, /location=\{request\.work_location\}/);
  assert.match(admin, /<WorkLocation location=\{request\.work_location\} \/>/);
});

test("the client request page has no follow-up composer", () => {
  const detail = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const create = readFileSync(new URL("../app/client/(portal)/new/page.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");

  assert.match(detail, /<Thread /);
  assert.match(detail, /AdvanceStage/);
  assert.match(detail, /DocumentChain/);
  assert.match(detail, /ClientRequestHeading/);
  assert.doesNotMatch(detail, /補充或回覆/);
  assert.doesNotMatch(detail, /Composer/);
  assert.doesNotMatch(detail, /prepareClientReply/);

  assert.match(create, /<Composer audience="client" mode="create" \/>/);
  assert.match(admin, /<h3 className="font-semibold">回覆<\/h3>/);
  assert.match(admin, /可以附上已完成的報價、發票或收據/);
  assert.match(admin, /<Composer audience="admin" mode="reply" requestId=\{request\.id\} \/>/);

  assert.doesNotMatch(actions, /prepareClientReply/);
  assert.match(actions, /prepareClientRequest/);
  assert.match(actions, /finalizeClientUploads/);
  assert.doesNotMatch(composer, /prepareClientReply/);
  assert.match(composer, /prepareAdminReply/);
  assert.match(composer, /mode === "reply" \? "回覆客戶" : "提交請求"/);
});
