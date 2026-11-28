import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DeleteConversationMessageForm } from "../components/delete-message";
import { Thread } from "../components/thread";
import type { MessageRow } from "./database.types";
import { DELETE_CONFIRM_VALUE } from "./domain";
import { canDeleteConversationMessage } from "./message-delete";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const replyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function message(partial: Pick<MessageRow, "id" | "kind"> & Partial<MessageRow>): MessageRow {
  return {
    id: partial.id,
    request_id: requestId,
    author_role: partial.author_role ?? "client",
    kind: partial.kind,
    body: partial.body ?? null,
    status_from: partial.status_from ?? null,
    status_to: partial.status_to ?? null,
    stage_from: partial.stage_from ?? null,
    stage_to: partial.stage_to ?? null,
    created_at: partial.created_at ?? "2026-11-01T00:00:00.000Z",
  };
}

test("only an admin can delete a conversation message", () => {
  assert.equal(canDeleteConversationMessage({ actorRole: "admin", kind: "message" }), true);
  assert.equal(canDeleteConversationMessage({ actorRole: "client", kind: "message" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: null, kind: "message" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: undefined, kind: "message" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: "", kind: "message" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: "admin ", kind: "message" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: "admin", kind: "status_change" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: "admin", kind: "stage_change" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: "admin", kind: "" }), false);
  assert.equal(canDeleteConversationMessage({ actorRole: "client", kind: "status_change" }), false);
});

test("deleting a message asks for confirmation and drops that message's files from the thread", () => {
  const idle = renderToStaticMarkup(
    createElement(DeleteConversationMessageForm, {
      requestId,
      messageId: originalId,
      mine: false,
      action: async () => ({ ok: true as const }),
    }),
  );
  assert.match(idle, /aria-label="刪除這則訊息"/);
  assert.match(idle, />刪除</);
  assert.doesNotMatch(idle, /確認刪除/);
  assert.doesNotMatch(idle, /確定要刪除這則訊息/);
  assert.doesNotMatch(idle, new RegExp(DELETE_CONFIRM_VALUE));

  const confirming = renderToStaticMarkup(
    createElement(DeleteConversationMessageForm, {
      requestId,
      messageId: originalId,
      mine: true,
      confirming: true,
      action: async () => ({ ok: false as const, error: "未能刪除這則訊息。" }),
    }),
  );
  assert.match(confirming, /確定要刪除這則訊息/);
  assert.match(confirming, /這則訊息和附件會一併移除，而且無法還原/);
  assert.match(confirming, />確認刪除</);
  assert.match(confirming, />取消</);
  assert.doesNotMatch(confirming, /type="submit"|name="body"/);

  const source = readFileSync(new URL("../components/delete-message.tsx", import.meta.url), "utf8");
  assert.match(source, /DELETE_CONFIRM_VALUE/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /正在刪除…/);

  const before = renderToStaticMarkup(
    createElement(Thread, {
      requestId,
      attachments: [
        {
          id: "file-original",
          message_id: originalId,
          file_name: "地盤圖.png",
          mime_type: "image/png",
          size_bytes: 20,
        },
        {
          id: "file-reply",
          message_id: replyId,
          file_name: "報價.pdf",
          mime_type: "application/pdf",
          size_bytes: 30,
        },
      ],
      messages: [
        message({ id: originalId, kind: "message", author_role: "client", body: "原來的內容", created_at: "2026-11-01T00:00:00.000Z" }),
        message({
          id: "status-1",
          kind: "status_change",
          author_role: "system",
          body: "狀態由待處理改為處理中",
          created_at: "2026-11-02T00:00:00.000Z",
        }),
        message({
          id: "stage-1",
          kind: "stage_change",
          author_role: "system",
          body: "階段由出報價單改為出發票",
          created_at: "2026-11-03T00:00:00.000Z",
        }),
        message({ id: replyId, kind: "message", author_role: "admin", body: "已回覆", created_at: "2026-11-04T00:00:00.000Z" }),
      ],
    }),
  );
  assert.match(before, /原來的內容/);
  assert.match(before, /地盤圖\.png/);
  assert.match(before, /已回覆/);
  assert.match(before, /報價\.pdf/);
  assert.doesNotMatch(before, /刪除這則訊息|確認刪除|狀態由|階段由/);

  const after = renderToStaticMarkup(
    createElement(Thread, {
      attachments: [
        {
          id: "file-original",
          message_id: originalId,
          file_name: "地盤圖.png",
          mime_type: "image/png",
          size_bytes: 20,
        },
        {
          id: "file-reply",
          message_id: replyId,
          file_name: "報價.pdf",
          mime_type: "application/pdf",
          size_bytes: 30,
        },
      ],
      messages: [
        message({ id: replyId, kind: "message", author_role: "admin", body: "已回覆", created_at: "2026-11-04T00:00:00.000Z" }),
      ],
    }),
  );
  assert.match(after, /已回覆/);
  assert.match(after, /報價\.pdf/);
  assert.doesNotMatch(after, /原來的內容|地盤圖\.png|刪除這則訊息/);
});

test("the delete action is admin-only, removes conversation messages and their files, and stays quiet", () => {
  const admin = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const uploads = readFileSync(new URL("./uploads.ts", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const thread = readFileSync(new URL("../components/thread.tsx", import.meta.url), "utf8");
  const cached = readFileSync(new URL("../components/cached-screen.tsx", import.meta.url), "utf8");
  const fn = admin.slice(
    admin.indexOf("export async function deleteConversationMessage"),
    admin.indexOf("export async function deleteRequest"),
  );
  const files = uploads.slice(
    uploads.indexOf("export async function deleteMessageFiles"),
    uploads.indexOf("export async function deleteRequestFiles"),
  );

  const sessionAt = fn.indexOf("readSession()");
  const adminAt = fn.indexOf('session.kind !== "admin"');
  const confirmAt = fn.indexOf("isDeleteConfirmed(input.confirm)");
  const kindAt = fn.indexOf("canDeleteConversationMessage(");
  const deleteAt = fn.indexOf("delete from messages");
  const storageAt = fn.indexOf("deleteMessageFiles(");
  assert.ok(sessionAt > -1 && adminAt > sessionAt && confirmAt > adminAt && kindAt > confirmAt && deleteAt > kindAt);
  assert.ok(storageAt > deleteAt, "object storage is removed after the message row is deleted");
  assert.match(fn, /kind = 'message'/);
  assert.doesNotMatch(fn, /author_role/);
  assert.match(fn, /from attachments/);
  assert.match(fn, /where message_id = \$\{input\.messageId\}/);
  assert.match(fn, /revalidatePath\(adminRequestPath\(input\.requestId\)\)/);
  assert.match(fn, /revalidatePath\(clientRequestPath\(input\.requestId\)\)/);
  assert.match(fn, /請先登入。/);
  assert.match(fn, /請先確認才可以刪除。/);
  assert.match(fn, /這則紀錄不能刪除。/);
  assert.doesNotMatch(fn, /insert into messages|insert into notification_events|update requests/i);
  assert.doesNotMatch(fn, /last_activity_at|admin_unread|client_unread/);
  assert.doesNotMatch(fn, /notifyAdminOfNewRequest|telegram|delete from requests|deleteRequestFiles/i);
  assert.doesNotMatch(fn, /set (topic|stage|status|work_location)/i);

  assert.match(files, /storageKeysForMessage\(requestId, messageId, paths\)/);
  assert.match(files, /deleteObject\(key\)/);
  assert.match(files, /stagingObjectKey\(path, index\)/);
  assert.doesNotMatch(files, /deleteStagingPrefix|delete from /);

  assert.doesNotMatch(client, /deleteConversationMessage|delete from messages/i);
  assert.match(adminPage, /deleteMessage=\{deleteConversationMessage\}/);
  assert.match(adminPage, /originalContent !== null \? \(requestSourceText\(thread\.messages\) \?\? ""\) : ""/);
  assert.match(clientPage, /originalContent !== null \? \(requestSourceText\(thread\.messages\) \?\? ""\) : ""/);
  assert.match(adminPage, /requestId=\{request\.id\}/);
  assert.match(thread, /message\.kind === "message"/);
  assert.match(thread, /<DeleteConversationMessage/);
  assert.match(thread, /messageId=\{message\.id\}/);
  assert.doesNotMatch(clientPage, /deleteConversationMessage|deleteMessage=|刪除這則訊息/);
  assert.doesNotMatch(cached, /deleteMessage=|deleteConversationMessage/);
  assert.doesNotMatch(clientPage, /補充或回覆/);
});
