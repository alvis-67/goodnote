import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DeleteClient } from "../components/delete-client";
import {
  clientDeleteConfirmNotice,
  clientDeleteConsequence,
  clientDeleteFailedNotice,
  clientDeletedNotice,
  clientListNotice,
  clientMissingNotice,
  clientsListHref,
} from "./client-delete";

const clientId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

function markup(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

test("delete asks for confirmation before a client can be removed", () => {
  const askHref = clientsListHref({ deleteId: clientId });
  const cancelHref = clientsListHref();
  const idle = markup(
    createElement(DeleteClient, {
      clientId,
      companyName: "甲工程公司",
      confirming: false,
      action: () => undefined,
      askHref,
      cancelHref,
    }),
  );
  assert.match(idle, /刪除客戶/);
  assert.match(idle, /aria-label="刪除甲工程公司"/);
  assert.match(idle, new RegExp(`href="${askHref.replaceAll("?", "\\?")}"`));
  assert.doesNotMatch(idle, /<form/);
  assert.doesNotMatch(idle, /確認刪除/);
  assert.doesNotMatch(idle, /name="confirm"/);
  assert.doesNotMatch(idle, /無法還原/);

  const confirming = markup(
    createElement(DeleteClient, {
      clientId,
      companyName: "甲工程公司",
      confirming: true,
      action: () => undefined,
      askHref,
      cancelHref,
    }),
  );
  assert.match(confirming, /確定要刪除「甲工程公司」/);
  assert.match(confirming, new RegExp(clientDeleteConsequence));
  assert.match(confirming, /登入會立即結束/);
  assert.match(confirming, /不能再登入/);
  assert.match(confirming, /請求、訊息和上載檔案/);
  assert.match(confirming, /無法還原/);
  assert.match(confirming, /name="confirm" value="yes"/);
  assert.match(confirming, new RegExp(`name="clientId" value="${clientId}"`));
  assert.match(confirming, /確認刪除/);
  assert.match(confirming, /href="\/admin\/clients"/);
  assert.match(confirming, /type="submit"/);
  assert.doesNotMatch(confirming, /href="\/admin\/clients\?delete=/);
});

test("the clients list explains success, failure, and a client that is already gone", () => {
  assert.equal(clientsListHref(), "/admin/clients");
  assert.equal(clientsListHref({ deleteId: clientId }), `/admin/clients?delete=${clientId}`);
  assert.equal(
    clientsListHref({ deleteId: clientId, error: "confirm" }),
    `/admin/clients?delete=${clientId}&error=confirm`,
  );
  assert.equal(clientsListHref({ notice: "deleted" }), "/admin/clients?notice=deleted");
  assert.equal(clientsListHref({ error: "missing" }), "/admin/clients?error=missing");
  assert.equal(clientsListHref({ error: "delete" }), "/admin/clients?error=delete");

  assert.deepEqual(clientListNotice({ notice: "deleted", clientIds: [otherId] }), {
    tone: "ok",
    text: clientDeletedNotice,
  });
  assert.match(clientDeletedNotice, /登入已結束/);
  assert.match(clientDeletedNotice, /不能再登入/);
  assert.match(clientDeletedNotice, /無法還原/);
  assert.deepEqual(clientListNotice({ error: "delete", clientIds: [otherId] }), {
    tone: "danger",
    text: clientDeleteFailedNotice,
  });
  assert.deepEqual(clientListNotice({ error: "missing", clientIds: [otherId] }), {
    tone: "danger",
    text: clientMissingNotice,
  });
  assert.deepEqual(
    clientListNotice({ deleteId: clientId, clientIds: [otherId] }),
    { tone: "danger", text: clientMissingNotice },
  );
  assert.deepEqual(
    clientListNotice({ error: "confirm", deleteId: clientId, clientIds: [clientId] }),
    { tone: "danger", text: clientDeleteConfirmNotice },
  );
  assert.equal(clientListNotice({ deleteId: clientId, clientIds: [clientId] }), null);
  assert.equal(clientListNotice({ clientIds: [] }), null);
});

test("only an admin action can delete a client, and a missing client returns to the list", () => {
  const admin = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const clientsPage = readFileSync(new URL("../app/admin/(desk)/clients/page.tsx", import.meta.url), "utf8");
  const clientHome = readFileSync(new URL("../app/client/(portal)/page.tsx", import.meta.url), "utf8");
  const clientRequest = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const clientNew = readFileSync(new URL("../app/client/(portal)/new/page.tsx", import.meta.url), "utf8");
  const deleteClient = admin.slice(
    admin.indexOf("export async function deleteClient"),
    admin.indexOf("export async function prepareAdminReply"),
  );
  const deleteRequest = admin.slice(
    admin.indexOf("export async function deleteRequest"),
    admin.indexOf("export async function deleteClient"),
  );

  const adminAt = deleteClient.indexOf("await requireAdmin()");
  const confirmAt = deleteClient.indexOf('isDeleteConfirmed(formData.get("confirm"))');
  const deleteAt = deleteClient.indexOf("delete from clients");
  assert.ok(adminAt > -1, "deleteClient requires an admin");
  assert.ok(confirmAt > adminAt, "confirmation is checked after the admin session");
  assert.ok(deleteAt > confirmAt, "the client row is deleted only after confirmation");
  assert.match(deleteClient, /clientsListHref\(\{ error: "missing" \}\)/);
  assert.match(deleteClient, /clientsListHref\(\{ deleteId: clientId, error: "confirm" \}\)/);
  assert.match(deleteClient, /clientsListHref\(\{ notice: "deleted" \}\)/);
  assert.match(deleteClient, /storageKeysByRequest/);
  assert.match(deleteClient, /deleteRequestFiles/);
  assert.doesNotMatch(deleteClient, /deleteObject\(/);
  assert.doesNotMatch(deleteClient, /delete from requests/);

  assert.match(deleteRequest, /delete from requests/);
  assert.match(deleteRequest, /isDeleteConfirmed\(formData\.get\("confirm"\)\)/);
  assert.match(deleteRequest, /deleteRequestFiles/);
  assert.match(deleteRequest, /redirect\("\/admin\?notice=deleted"\)/);
  assert.doesNotMatch(deleteRequest, /delete from clients/);

  assert.match(clientsPage, /DeleteClient/);
  assert.match(clientsPage, /clientListNotice/);
  assert.match(clientsPage, /action=\{deleteClient\}/);
  assert.doesNotMatch(clientsPage, /notFound\(/);

  assert.doesNotMatch(client, /deleteClient|delete\s+from\s+clients/i);
  for (const source of [clientHome, clientRequest, clientNew]) {
    assert.doesNotMatch(source, /DeleteClient|deleteClient|刪除客戶/);
  }
});
