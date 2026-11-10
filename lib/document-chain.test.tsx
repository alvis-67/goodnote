import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdvanceStage } from "../components/advance-stage";
import { ClientRequestList } from "../components/client-request-list";
import { DocumentChain } from "../components/document-chain";
import { Thread } from "../components/thread";
import type { MessageRow, RequestRow } from "./database.types";
import { clientRequestPath } from "./paths";
import { adminStagePrompt, stageAdvanceLabel, stageAdvanceNote } from "./request-stage";

const quoteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invoiceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const receiptId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function request(
  partial: Pick<RequestRow, "id" | "topic" | "work_location"> &
    Partial<Pick<RequestRow, "parent_request_id" | "stage" | "status">>,
): RequestRow {
  const now = "2026-11-10T02:00:00.000Z";
  return {
    id: partial.id,
    client_id: "11111111-1111-4111-8111-111111111111",
    topic: partial.topic,
    stage: partial.stage ?? partial.topic,
    status: partial.status ?? "issued",
    work_location: partial.work_location,
    parent_request_id: partial.parent_request_id ?? null,
    created_at: now,
    updated_at: now,
    last_activity_at: now,
    admin_unread: false,
    admin_last_read_at: now,
    client_unread: false,
    client_last_read_at: null,
  };
}

function message(partial: Pick<MessageRow, "id" | "kind"> & Partial<MessageRow>): MessageRow {
  return {
    id: partial.id,
    request_id: quoteId,
    author_role: partial.author_role ?? "system",
    kind: partial.kind,
    body: partial.body ?? null,
    status_from: partial.status_from ?? null,
    status_to: partial.status_to ?? null,
    stage_from: partial.stage_from ?? null,
    stage_to: partial.stage_to ?? null,
    created_at: partial.created_at ?? "2026-11-10T02:00:00.000Z",
  };
}

function html(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

test("advancing stays on this request and old links stay viewable", () => {
  const quote = html(
    createElement(AdvanceStage, {
      requestId: quoteId,
      label: stageAdvanceLabel("quote", "quote") ?? "",
      note: stageAdvanceNote(),
      action: () => undefined,
    }),
  );
  assert.match(quote, /改為已出報價單，請出發票/);
  assert.match(quote, /不會另開一則/);
  assert.match(quote, /待處理/);
  assert.match(quote, new RegExp(`name="requestId" value="${quoteId}"`));
  assert.match(quote, /type="submit"/);
  assert.doesNotMatch(quote, /textarea|type="file"|name="workLocation"|開出發票|開出收據|\/next/);

  const receiptStep = html(
    createElement(AdvanceStage, {
      requestId: quoteId,
      label: stageAdvanceLabel("quote", "invoice") ?? "",
      note: stageAdvanceNote(),
      prompt: adminStagePrompt("甲工程公司", "quote", "invoice"),
      action: () => undefined,
    }),
  );
  assert.match(receiptStep, /你可以為甲工程公司改為「發票，已收錢，請出收據」/);
  assert.match(receiptStep, /改為發票，已收錢，請出收據/);
  assert.doesNotMatch(receiptStep, /開出收據|\/next/);

  const standaloneInvoice = html(
    createElement(AdvanceStage, {
      requestId: invoiceId,
      label: stageAdvanceLabel("invoice", "invoice") ?? "",
      note: stageAdvanceNote(),
      prompt: adminStagePrompt("甲工程公司", "invoice", "invoice"),
      action: () => undefined,
    }),
  );
  assert.match(standaloneInvoice, /你可以為甲工程公司改為「發票，已收錢，請出收據」/);
  assert.doesNotMatch(standaloneInvoice, /已出報價單，請出發票/);

  const oldLinks = html(
    createElement(DocumentChain, {
      parent: { id: quoteId, topic: "quote" },
      child: { id: receiptId, topic: "receipt" },
      hrefFor: clientRequestPath,
    }),
  );
  assert.match(oldLinks, /由出報價單開出/);
  assert.match(oldLinks, /已開出收據/);
  assert.match(oldLinks, new RegExp(`href="${clientRequestPath(quoteId)}"`));
  assert.match(oldLinks, new RegExp(`href="${clientRequestPath(receiptId)}"`));
  assert.doesNotMatch(oldLinks, />開出發票<|>開出收據<|\/next|textarea/);

  assert.equal(
    html(
      createElement(DocumentChain, {
        parent: null,
        child: null,
        hrefFor: clientRequestPath,
      }),
    ),
    "",
  );
});

test("one job is one row, titled with the current stage", () => {
  const markup = html(
    createElement(ClientRequestList, {
      requests: [
        request({
          id: quoteId,
          topic: "quote",
          stage: "invoice",
          work_location: "九龍灣地盤",
          status: "pending",
        }),
      ],
    }),
  );
  const items = markup.split("<li").slice(1);
  assert.equal(items.length, 1);
  assert.match(items[0] ?? "", /已出報價單，請出發票/);
  assert.match(items[0] ?? "", /九龍灣地盤/);
  assert.match(items[0] ?? "", /待處理/);
  assert.match(items[0] ?? "", new RegExp(`href="${clientRequestPath(quoteId)}"`));
  assert.doesNotMatch(markup, /開出發票|開出收據|出收據/);

  const legacy = html(
    createElement(ClientRequestList, {
      requests: [
        {
          ...request({ id: quoteId, topic: "quote", work_location: "九龍灣地盤" }),
          child: { id: invoiceId, topic: "invoice" },
        },
        {
          ...request({
            id: invoiceId,
            topic: "invoice",
            work_location: "九龍灣地盤",
            parent_request_id: quoteId,
          }),
          parent: { id: quoteId, topic: "quote" },
        },
      ],
    }),
  );
  const legacyItems = legacy.split("<li").slice(1);
  assert.equal(legacyItems.length, 2);
  assert.match(legacyItems[0] ?? "", /出報價單/);
  assert.match(legacyItems[0] ?? "", /已開出發票/);
  assert.match(legacyItems[0] ?? "", new RegExp(`href="${clientRequestPath(invoiceId)}"`));
  assert.match(legacyItems[1] ?? "", /出發票/);
  assert.match(legacyItems[1] ?? "", /由出報價單開出/);
  assert.doesNotMatch(legacy, />開出發票<|>開出收據</);
});

test("the timeline shows the stage change and the status change on the same request", () => {
  const markup = html(
    createElement(Thread, {
      topic: "quote",
      urls: new Map(),
      attachments: [
        {
          id: "file-1",
          message_id: "message-1",
          file_name: "報價.pdf",
          mime_type: "application/pdf",
          size_bytes: 1200,
          storage_path: "kept",
        },
      ],
      messages: [
        message({
          id: "message-1",
          kind: "message",
          author_role: "client",
          body: "請報價泥水工程",
        }),
        message({
          id: "stage-1",
          kind: "stage_change",
          body: "階段由出報價單改為已出報價單，請出發票",
          stage_from: "quote",
          stage_to: "invoice",
        }),
        message({
          id: "status-1",
          kind: "status_change",
          author_role: "system",
          status_from: "issued",
          status_to: "pending",
        }),
      ],
    }),
  );
  assert.match(markup, /請報價泥水工程/);
  assert.match(markup, /報價\.pdf/);
  assert.match(markup, /階段由出報價單改為已出報價單，請出發票/);
  assert.match(markup, /狀態由已出單改為待處理/);
  const stageOnly = html(
    createElement(Thread, {
      topic: "invoice",
      urls: new Map(),
      attachments: [],
      messages: [
        message({
          id: "stage-2",
          kind: "stage_change",
          stage_from: "invoice",
          stage_to: "receipt",
        }),
      ],
    }),
  );
  assert.match(stageOnly, /階段由出發票改為發票，已收錢，請出收據/);
});

test("new stage changes do not create a linked request", () => {
  const clientAction = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const adminAction = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const stageAction = readFileSync(new URL("./actions/stage.ts", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../app/admin/(desk)/page.tsx", import.meta.url), "utf8");
  const chain = readFileSync(new URL("../components/document-chain.tsx", import.meta.url), "utf8");
  const advance = stageAction.slice(
    stageAction.indexOf("async function moveRequestStage"),
    stageAction.indexOf("function revalidateStage"),
  );

  assert.equal(existsSync(new URL("./linked-request.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/client/(portal)/requests/[id]/next/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/admin/(desk)/requests/[id]/next/page.tsx", import.meta.url)), false);

  assert.match(clientAction, /insert into requests \(client_id, topic, work_location\)/);
  assert.doesNotMatch(clientAction, /parent_request_id|prepareLinkedRequest/);
  assert.doesNotMatch(adminAction, /parent_request_id|prepareAdminLinkedReceipt|insert into requests/i);
  assert.match(advance, /set stage = \$\{next\}/);
  assert.match(advance, /status = 'pending'/);
  assert.match(advance, /admin_unread = true/);
  assert.match(advance, /where id = \$\{requestId\}/);
  assert.match(advance, /and stage = \$\{stage\}/);
  assert.match(advance, /nextRequestStage\(topic, stage\)/);
  assert.doesNotMatch(advance, /insert\s+into\s+requests/i);
  assert.doesNotMatch(advance, /parent_request_id/);
  assert.doesNotMatch(advance, /formData\.get\("stage"\)|formData\.get\("topic"\)/);
  assert.doesNotMatch(stageAction, /signOut|destroyCurrentSession/);

  assert.match(clientPage, /advanceClientRequestStage/);
  assert.match(clientPage, /stageAdvanceLabel\(request\.topic, request\.stage\)/);
  assert.match(clientPage, /requestTitle|stage=\{request\.stage\}/);
  assert.match(clientPage, /<DocumentChain/);
  assert.match(clientPage, /topic=\{request\.topic\}/);
  assert.doesNotMatch(clientPage, /\/next|開出發票|開出收據|prepareLinkedRequest/);

  assert.match(adminPage, /advanceAdminRequestStage/);
  assert.match(adminPage, /adminStagePrompt\(client\.company_name, request\.topic, request\.stage\)/);
  assert.match(adminPage, /<StatusMenu/);
  assert.match(adminPage, /setRequestStatus/);
  assert.match(adminPage, /query\.notice === "status"/);
  assert.match(adminPage, /狀態已更新，並寫進時間線/);
  assert.match(adminPage, /<DocumentChain/);
  assert.doesNotMatch(adminPage, /\/next|開出發票|開出收據|InvoiceReceiptPrompt|prepareAdminLinkedReceipt/);

  assert.match(desk, /requestTitle\(row\.topic, row\.stage\)/);
  assert.match(desk, /<RequestChainLinks/);
  assert.doesNotMatch(desk, /\/next|開出發票|開出收據/);
  assert.doesNotMatch(chain, /\/next|開出發票|開出收據|startHref/);
  assert.doesNotMatch(composer, /prepareLinkedRequest|prepareAdminLinkedReceipt|mode === "follow"|\/next/);
  assert.match(composer, /mode: "create" \| "reply"/);
  assert.match(adminPage, new RegExp(`hrefFor=\{${"adminRequestPath"}`));
  assert.match(desk, /adminRequestPath/);
});
