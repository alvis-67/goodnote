import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditRequestContentForm } from "../components/edit-request-content";
import { STATUSES } from "./domain";
import {
  CLIENT_CONTENT_EDIT_FIELDS,
  canClientEditRequestContent,
  clientContentEditTouchesOnlyBody,
  originalClientContent,
  parseRequestContent,
} from "./request-content";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("only the owning client can edit content, at every status and stage", () => {
  const stages = ["quote", "invoice", "receipt", "management", "insurance", "other"];
  for (const status of STATUSES) {
    for (const stage of stages) {
      assert.equal(
        canClientEditRequestContent({
          actorClientId: owner,
          ownerClientId: owner,
          status: status.id,
          stage,
        }),
        true,
        `${status.id} / ${stage}`,
      );
    }
  }
  assert.equal(
    canClientEditRequestContent({ actorClientId: owner, ownerClientId: owner, status: "issued", stage: "quote" }),
    true,
  );
  assert.equal(
    canClientEditRequestContent({ actorClientId: owner, ownerClientId: owner, status: "", stage: "" }),
    true,
  );
  assert.equal(
    canClientEditRequestContent({ actorClientId: other, ownerClientId: owner, status: "pending", stage: "quote" }),
    false,
  );
  assert.equal(
    canClientEditRequestContent({ actorClientId: null, ownerClientId: owner, status: "completed", stage: "receipt" }),
    false,
  );
  assert.equal(
    canClientEditRequestContent({ actorClientId: "  ", ownerClientId: owner, status: "in_progress", stage: "invoice" }),
    false,
  );
  assert.equal(
    canClientEditRequestContent({ actorClientId: owner, ownerClientId: "  ", status: "recorded", stage: "quote" }),
    false,
  );
});

test("a content edit can change only the original message body", () => {
  assert.deepEqual(CLIENT_CONTENT_EDIT_FIELDS, ["body"]);
  assert.equal(clientContentEditTouchesOnlyBody(["body"]), true);
  assert.equal(clientContentEditTouchesOnlyBody(["body", "topic"]), false);
  assert.equal(clientContentEditTouchesOnlyBody(["work_location"]), false);
  assert.equal(clientContentEditTouchesOnlyBody(["status"]), false);
  assert.equal(clientContentEditTouchesOnlyBody(["stage"]), false);
  assert.equal(clientContentEditTouchesOnlyBody([]), false);

  const messages = [
    { kind: "status_change", author_role: "system", body: "狀態由待處理改為處理中" },
    { kind: "message", author_role: "client", body: "原來的內容" },
    { kind: "message", author_role: "admin", body: "已入機" },
    { kind: "message", author_role: "client", body: "稍後補充" },
  ];
  assert.equal(originalClientContent(messages), "原來的內容");
  assert.equal(
    originalClientContent([
      { kind: "message", author_role: "client", body: null },
      { kind: "message", author_role: "client", body: "稍後補充" },
    ]),
    "",
  );
  assert.equal(originalClientContent([]), "");

  const trimmed = parseRequestContent("  請改這段  ");
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) assert.equal(trimmed.value, "請改這段");
  assert.equal(parseRequestContent("").ok, true);
  assert.equal(parseRequestContent("字".repeat(4001)).ok, false);
  assert.equal(parseRequestContent(null).ok, false);
});

test("the client content action checks ownership, ignores status, and does not notify", () => {
  const action = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const start = action.indexOf("export async function updateClientRequestContent");
  const fn = action.slice(start, action.indexOf("export async function markClientRequestRead"));
  assert.ok(start > action.indexOf("notifyAdminOfNewRequest"));
  assert.match(fn, /clientScope\(\)/);
  assert.match(fn, /and client_id = \$\{scope\.context\.client\.id\}/);
  assert.match(fn, /canClientEditRequestContent\(/);
  assert.ok(fn.indexOf("canClientEditRequestContent(") < fn.indexOf("update messages"));
  assert.match(fn, /set body = /);
  assert.match(fn, /author_role = 'client'/);
  assert.match(fn, /kind = 'message'/);
  assert.match(fn, /order by m\.created_at asc, m\.id asc/);
  assert.doesNotMatch(fn, /notifyAdminOfNewRequest/);
  assert.doesNotMatch(fn, /notification_events/);
  assert.doesNotMatch(fn, /insert into messages/i);
  assert.doesNotMatch(fn, /set (topic|stage|status|work_location)/i);
  assert.doesNotMatch(fn, /where[^;]*status =/i);
  assert.match(action, /after\(\(\) =>\s*notifyAdminOfNewRequest/);

  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(adminPage, /EditRequestContent|updateClientRequestContent/);
});

test("the content editor offers save and cancel, and keeps other fields out", () => {
  const idle = renderToStaticMarkup(
    createElement(EditRequestContentForm, {
      requestId,
      content: "請出報價，棚架加名",
      action: async () => ({ ok: true as const }),
    }),
  );
  assert.match(idle, /內容/);
  assert.match(idle, /請出報價，棚架加名/);
  assert.match(idle, /修改內容/);
  assert.match(idle, /可以隨時修改內容/);
  assert.doesNotMatch(idle, /<textarea/);
  assert.doesNotMatch(idle, /補充或回覆/);
  assert.doesNotMatch(idle, /type="file"/);
  assert.doesNotMatch(idle, /name="topic"|name="workLocation"|name="status"/);
  assert.doesNotMatch(idle, /<select/);

  const editing = renderToStaticMarkup(
    createElement(EditRequestContentForm, {
      requestId,
      content: "請出報價，棚架加名",
      initiallyEditing: true,
      action: async () => ({ ok: false as const, error: "未能儲存內容。" }),
    }),
  );
  assert.match(editing, /<textarea[^>]*name="body"/);
  assert.match(editing, /請出報價，棚架加名/);
  assert.match(editing, />儲存</);
  assert.match(editing, />取消</);
  assert.match(editing, /min-h-12 w-full/);
  assert.match(editing, /只會儲存這段內容/);
  assert.doesNotMatch(editing, /type="file"/);
  assert.doesNotMatch(editing, /事項\s*<input|name="topic"|name="workLocation"|name="status"/);
  assert.doesNotMatch(editing, /補充或回覆/);

  const blank = renderToStaticMarkup(
    createElement(EditRequestContentForm, {
      requestId,
      content: "   ",
      action: async () => ({ ok: true as const }),
    }),
  );
  assert.match(blank, /尚未填寫內容/);
  assert.match(blank, /修改內容/);

  const source = readFileSync(new URL("../components/edit-request-content.tsx", import.meta.url), "utf8");
  assert.match(source, /role="alert"/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /正在儲存…/);
  assert.match(source, /內容已更新。/);
  assert.match(source, /router\.refresh\(\)/);
  assert.doesNotMatch(source, /notifyAdminOfNewRequest|Composer|補充或回覆/);
});
