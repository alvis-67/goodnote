import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdvanceStage, StagePrompt } from "../components/advance-stage";
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
    status: partial.status ?? "completed",
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
  assert.match(quote, />出發票</);
  assert.match(quote, /不會另開一則/);
  assert.match(quote, /待處理/);
  assert.match(quote, new RegExp(`name="requestId" value="${quoteId}"`));
  assert.match(quote, /type="submit"/);
  assert.doesNotMatch(quote, /已收錢|textarea|type="file"|name="workLocation"|開出發票|開出收據|\/next/);

  const quoteAdmin = html(
    createElement(AdvanceStage, {
      requestId: quoteId,
      label: stageAdvanceLabel("quote", "quote") ?? "",
      note: stageAdvanceNote(),
      prompt: adminStagePrompt("甲工程公司", "quote", "quote"),
      action: () => undefined,
    }),
  );
  assert.match(quoteAdmin, /你可以為甲工程公司出報價單。/);
  assert.match(quoteAdmin, />出發票</);
  assert.doesNotMatch(quoteAdmin, /已收錢|出收據/);

  const invoiceStep = html(
    createElement(AdvanceStage, {
      requestId: quoteId,
      label: stageAdvanceLabel("quote", "invoice") ?? "",
      note: stageAdvanceNote(),
      prompt: adminStagePrompt("甲工程公司", "quote", "invoice"),
      action: () => undefined,
    }),
  );
  assert.match(invoiceStep, /<p class="font-semibold">你可以為甲工程公司出發票。<\/p>/);
  assert.match(invoiceStep, />已收錢，請出收據</);
  assert.doesNotMatch(invoiceStep, /你可以為甲工程公司改為「已收錢|開出收據|\/next/);

  const standaloneInvoice = html(
    createElement(AdvanceStage, {
      requestId: invoiceId,
      label: stageAdvanceLabel("invoice", "invoice") ?? "",
      note: stageAdvanceNote(),
      prompt: adminStagePrompt("甲工程公司", "invoice", "invoice"),
      action: () => undefined,
    }),
  );
  assert.match(standaloneInvoice, /你可以為甲工程公司出發票。/);
  assert.match(standaloneInvoice, />已收錢，請出收據</);
  assert.doesNotMatch(standaloneInvoice, /已出報價單/);

  const paidReceipt = html(
    createElement(StagePrompt, {
      prompt: adminStagePrompt("甲工程公司", "quote", "receipt"),
    }),
  );
  assert.equal(stageAdvanceLabel("quote", "receipt"), null);
  assert.equal(stageAdvanceLabel("invoice", "receipt"), null);
  assert.equal(stageAdvanceLabel("receipt", "receipt"), null);
  assert.match(paidReceipt, /你可以為甲工程公司出收據。/);
  assert.doesNotMatch(paidReceipt, /<button|出發票|已出報價單/);

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
  assert.match(items[0] ?? "", /font-semibold">出發票</);
  assert.match(items[0] ?? "", /九龍灣地盤/);
  assert.match(items[0] ?? "", /待處理/);
  assert.match(items[0] ?? "", new RegExp(`href="${clientRequestPath(quoteId)}"`));
  assert.doesNotMatch(items[0] ?? "", /出收據/);
  assert.doesNotMatch(markup, /開出發票|開出收據/);

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

test("the timeline keeps messages and files and hides status and stage changes", () => {
  const markup = html(
    createElement(Thread, {
      attachments: [
        {
          id: "file-1",
          message_id: "message-1",
          file_name: "報價.pdf",
          mime_type: "application/pdf",
          size_bytes: 1200,
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
          body: "舊時間線原文",
          stage_from: "quote",
          stage_to: "invoice",
        }),
        message({
          id: "status-1",
          kind: "status_change",
          author_role: "system",
          status_from: "completed",
          status_to: "pending",
        }),
      ],
    }),
  );
  assert.match(markup, /請報價泥水工程/);
  assert.match(markup, /報價\.pdf/);
  assert.doesNotMatch(markup, /舊時間線原文/);
  assert.doesNotMatch(markup, /階段由/);
  assert.doesNotMatch(markup, /狀態由/);
  const hiddenOnly = html(
    createElement(Thread, {
      attachments: [],
      messages: [
        message({
          id: "stage-2",
          kind: "stage_change",
          body: "階段由出發票改為已收錢，請出收據",
          stage_from: "invoice",
          stage_to: "receipt",
        }),
        message({
          id: "status-2",
          kind: "status_change",
          author_role: "system",
          status_from: "pending",
          status_to: "recorded",
        }),
      ],
    }),
  );
  assert.match(hiddenOnly, /這條紀錄還沒有訊息/);
  assert.doesNotMatch(hiddenOnly, /階段由|狀態由/);
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
  assert.doesNotMatch(clientPage, /\/next|開出發票|開出收據|prepareLinkedRequest|StagePrompt|adminStagePrompt/);

  assert.match(adminPage, /advanceAdminRequestStage/);
  assert.match(adminPage, /const stagePrompt = adminStagePrompt\(client\.company_name, request\.topic, request\.stage\)/);
  assert.match(adminPage, /<StagePrompt prompt=\{stagePrompt\} \/>/);
  assert.match(adminPage, /<StatusMenu/);
  assert.match(adminPage, /setRequestStatus/);
  assert.match(adminPage, /query\.notice === "status"/);
  assert.match(adminPage, /狀態已更新。/);
  assert.doesNotMatch(adminPage, /寫進時間線/);
  assert.match(adminPage, /<DocumentChain/);
  assert.doesNotMatch(adminPage, /\/next|開出發票|開出收據|InvoiceReceiptPrompt|prepareAdminLinkedReceipt/);

  assert.match(desk, /requestTitle\(row\.topic, row\.stage\)/);
  assert.match(desk, /<RequestChainLinks/);
  assert.doesNotMatch(desk, /\/next|開出發票|開出收據/);
  assert.doesNotMatch(chain, /\/next|開出發票|開出收據|startHref/);
  assert.doesNotMatch(composer, /prepareLinkedRequest|prepareAdminLinkedReceipt|mode === "follow"|\/next/);
  assert.match(composer, /audience: "client"; mode: "create"/);
  assert.match(composer, /audience: "admin"; mode: "reply"/);
  assert.match(adminPage, new RegExp(`hrefFor=\{${"adminRequestPath"}`));
  assert.match(desk, /adminRequestPath/);
});
