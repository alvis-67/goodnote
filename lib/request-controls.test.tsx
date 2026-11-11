import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DeleteRequest } from "../components/delete-request";
import { StatusBadge } from "../components/status-badge";
import { StatusMenu } from "../components/status-menu";
import { STATUSES } from "./domain";
import { adminDeskHref } from "./paths";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function markup(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

test("the status menu offers every status and shows the current one", () => {
  for (const current of STATUSES) {
    const html = markup(
      createElement(StatusMenu, {
        requestId,
        status: current.id,
        action: () => undefined,
      }),
    );
    assert.match(html, /<select[^>]*name="status"/);
    assert.match(html, /狀態\s*<select/);
    const options = [...html.matchAll(/<option\b[^>]*>[^<]*<\/option>/g)].map((match) => {
      const value = match[0].match(/value="([^"]+)"/)?.[1];
      const label = match[0].match(/>([^<]*)<\/option>/)?.[1];
      return [value, label];
    });
    assert.deepEqual(
      options,
      STATUSES.map((status) => [status.id, status.label]),
    );
    assert.doesNotMatch(html, /處理中|已出單|in_progress|issued/);
    assert.match(html, new RegExp(`<option[^>]*selected[^>]*>${current.label}</option>|<option[^>]*>${current.label}</option>`));
    const selected = html.match(/<option[^>]*selected[^>]*>[^<]+<\/option>/);
    assert.ok(selected, `current status ${current.id} is selected`);
    assert.match(selected[0], new RegExp(current.label));
  }
});

test("delete asks for confirmation before the request can be removed", () => {
  const idle = markup(
    createElement(DeleteRequest, {
      requestId,
      confirming: false,
      action: () => undefined,
      askHref: "?confirm=delete",
      cancelHref: "?",
    }),
  );
  assert.match(idle, /刪除請求/);
  assert.match(idle, /href="\?confirm=delete"/);
  assert.doesNotMatch(idle, /<form/);
  assert.doesNotMatch(idle, /確認刪除/);
  assert.doesNotMatch(idle, /name="confirm"/);

  const confirming = markup(
    createElement(DeleteRequest, {
      requestId,
      confirming: true,
      action: () => undefined,
      askHref: "?confirm=delete",
      cancelHref: "?",
    }),
  );
  assert.match(confirming, /確定要刪除這則請求/);
  assert.match(confirming, /相關訊息、附件和通知會一併移除/);
  assert.match(confirming, /name="confirm" value="yes"/);
  assert.match(confirming, new RegExp(`name="requestId" value="${requestId}"`));
  assert.match(confirming, /確認刪除/);
  assert.match(confirming, /href="\?"/);
  assert.match(confirming, /type="submit"/);
});

test("the desk wires admin delete and a free status menu, and clients cannot delete", () => {
  const admin = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../app/admin/(desk)/page.tsx", import.meta.url), "utf8");
  const requestPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");

  assert.match(admin, /isDeleteConfirmed\(formData\.get\("confirm"\)\)/);
  assert.match(admin, /delete from requests/);
  assert.match(admin, /deleteRequestFiles/);
  assert.match(admin, /set status = \$\{status\}/);
  assert.doesNotMatch(admin, /nextStatus|advanceRequestStatus/);
  assert.doesNotMatch(client, /delete\s+from\s+requests/i);
  assert.match(desk, /DeleteRequest/);
  assert.match(requestPage, /StatusMenu/);
  assert.match(requestPage, /DeleteRequest/);
  assert.match(requestPage, /query\.confirm === "delete"/);
  assert.doesNotMatch(clientPage, /DeleteRequest|deleteRequest|刪除請求/);
});

test("status badges show the three labels", () => {
  const html = STATUSES.map((status) => markup(createElement(StatusBadge, { status: status.id }))).join("");
  assert.match(html, /待處理/);
  assert.match(html, /已入機/);
  assert.match(html, /已完成/);
  assert.doesNotMatch(html, /處理中|已出單/);
});

test("workbench delete links keep the current filters", () => {
  assert.equal(adminDeskHref({}), "/admin");
  assert.equal(
    adminDeskHref({
      status: "completed",
      topic: "quote",
      clientId: "11111111-1111-4111-8111-111111111111",
      deleteId: requestId,
    }),
    "/admin?status=completed&topic=quote&client=11111111-1111-4111-8111-111111111111&delete=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
});
