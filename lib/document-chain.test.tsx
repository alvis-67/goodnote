import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientRequestList } from "../components/client-request-list";
import { DocumentChain, InvoiceReceiptPrompt } from "../components/document-chain";
import type { RequestRow } from "./database.types";
import {
  adminCanOpenReceipt,
  adminReceiptAlreadyOpen,
  adminReceiptCarryOver,
  canFollowDocument,
  chainDuplicateError,
  followUpEmptyPlaceholder,
  followUpIntro,
  followUpPlaceholder,
  nextDocumentTopic,
  openingClientContent,
  requestContentRequired,
} from "./document-chain";
import { adminFollowUpPath, adminRequestPath, clientFollowUpPath, clientRequestPath } from "./paths";

const quoteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invoiceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const receiptId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function request(partial: Pick<RequestRow, "id" | "topic" | "work_location"> & Partial<Pick<RequestRow, "parent_request_id">>): RequestRow {
  const now = "2026-11-10T02:00:00.000Z";
  return {
    id: partial.id,
    client_id: "11111111-1111-4111-8111-111111111111",
    topic: partial.topic,
    status: "issued",
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

function html(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

test("the next document is invoice after a quotation, then a receipt", () => {
  assert.equal(nextDocumentTopic("quote"), "invoice");
  assert.equal(nextDocumentTopic("invoice"), "receipt");
  assert.equal(nextDocumentTopic("receipt"), null);
  assert.equal(nextDocumentTopic("other"), null);
  assert.equal(canFollowDocument("quote", "invoice"), true);
  assert.equal(canFollowDocument("invoice", "receipt"), true);
  assert.equal(canFollowDocument("quote", "receipt"), false);
  assert.equal(canFollowDocument("other", "invoice"), false);
  assert.equal(canFollowDocument("receipt", "invoice"), false);
  assert.match(followUpPlaceholder("invoice"), /客人已同意，可以開工/);
  assert.match(followUpEmptyPlaceholder(), /可以留空/);
  assert.match(followUpIntro("quote", "invoice", true, true), /出報價單/);
  assert.match(followUpIntro("quote", "invoice", true, true), /出發票/);
  assert.match(followUpIntro("quote", "invoice", true, true), /維持不變/);
  assert.match(followUpIntro("quote", "invoice", true, true), /工作地點已從原本的請求填上/);
  assert.match(followUpIntro("quote", "invoice", true, true), /內容已從原本的請求填上/);
  assert.match(followUpIntro("invoice", "receipt", false, false), /請填寫工作地點/);
  assert.match(followUpIntro("invoice", "receipt", false, false), /可以直接提交/);
  assert.doesNotMatch(followUpIntro("invoice", "receipt", false, false), /已從原本的請求填上/);
  assert.equal(chainDuplicateError("invoice"), "已經有出發票，不會再開一張。");
  assert.equal(requestContentRequired("create"), true);
  assert.equal(requestContentRequired("reply"), true);
  assert.equal(requestContentRequired("follow"), false);
  assert.equal(adminCanOpenReceipt("甲工程公司"), "你可以為甲工程公司開出收據。");
  assert.equal(adminCanOpenReceipt("  "), "你可以為這位客人開出收據。");
  assert.match(adminReceiptAlreadyOpen("甲工程公司"), /已為甲工程公司開出的收據/);
  assert.match(adminReceiptAlreadyOpen("甲工程公司"), /不會再開一張/);
  assert.match(adminReceiptCarryOver(), /工作地點和內容會從這張發票帶過去/);
});

test("follow-up content is the earliest client message, not a later reply", () => {
  const copied = openingClientContent([
    {
      id: "2",
      authorRole: "admin",
      kind: "message",
      body: "報價已附上",
      createdAt: "2026-11-10T01:00:00.000Z",
    },
    {
      id: "3",
      authorRole: "client",
      kind: "message",
      body: "   ",
      createdAt: "2026-11-10T00:30:00.000Z",
    },
    {
      id: "4",
      authorRole: "client",
      kind: "message",
      body: "稍後補充：連泥水",
      createdAt: "2026-11-10T03:00:00.000Z",
    },
    {
      id: "1",
      authorRole: "client",
      kind: "message",
      body: "  請報價泥水工程  ",
      createdAt: "2026-11-10T00:00:00.000Z",
    },
    {
      id: "5",
      authorRole: "system",
      kind: "status_change",
      body: "狀態由待處理改為已出單",
      createdAt: "2026-11-09T00:00:00.000Z",
    },
  ]);
  assert.equal(copied, "請報價泥水工程");
  assert.equal(
    openingClientContent([
      { authorRole: "client", kind: "message", body: null, createdAt: "2026-11-10T00:00:00.000Z" },
      { authorRole: "admin", kind: "message", body: "只有檔案", createdAt: "2026-11-10T01:00:00.000Z" },
    ]),
    "",
  );
  const sameTime = openingClientContent([
    { id: "b", authorRole: "client", kind: "message", body: "後寫", createdAt: "2026-11-10T00:00:00.000Z" },
    { id: "a", authorRole: "client", kind: "message", body: "先寫", createdAt: "2026-11-10T00:00:00.000Z" },
  ]);
  assert.equal(sameTime, "先寫");
});

test("a quotation offers a linked invoice, and an invoice offers a linked receipt", () => {
  const startQuote = html(
    createElement(DocumentChain, {
      topic: "quote",
      parent: null,
      child: null,
      hrefFor: clientRequestPath,
      startHref: clientFollowUpPath(quoteId),
    }),
  );
  assert.match(startQuote, /相關單據/);
  assert.match(startQuote, /開出發票/);
  assert.match(startQuote, /原本的出報價單不會更改事項、狀態、訊息或檔案/);
  assert.match(startQuote, new RegExp(`href="${clientFollowUpPath(quoteId)}"`));
  assert.doesNotMatch(startQuote, /開出收據|尚未開/);

  const openInvoice = html(
    createElement(DocumentChain, {
      topic: "quote",
      parent: null,
      child: { id: invoiceId, topic: "invoice" },
      hrefFor: clientRequestPath,
      startHref: clientFollowUpPath(quoteId),
    }),
  );
  assert.match(openInvoice, /已開出發票/);
  assert.match(openInvoice, /查看這張出發票/);
  assert.match(openInvoice, new RegExp(`href="${clientRequestPath(invoiceId)}"`));
  assert.doesNotMatch(openInvoice, /\/next/);

  const startReceipt = html(
    createElement(DocumentChain, {
      topic: "invoice",
      parent: { id: quoteId, topic: "quote" },
      child: null,
      hrefFor: clientRequestPath,
      startHref: clientFollowUpPath(invoiceId),
    }),
  );
  assert.match(startReceipt, /由出報價單開出/);
  assert.match(startReceipt, /查看這張出報價單/);
  assert.match(startReceipt, new RegExp(`href="${clientRequestPath(quoteId)}"`));
  assert.match(startReceipt, /開出收據/);
  assert.doesNotMatch(startReceipt, /開出發票/);

  const adminWaiting = html(
    createElement(DocumentChain, {
      topic: "quote",
      parent: null,
      child: null,
      hrefFor: (id) => `/admin/requests/${id}`,
      startHref: null,
    }),
  );
  assert.match(adminWaiting, /尚未開出發票/);
  assert.doesNotMatch(adminWaiting, /\/next/);
  assert.doesNotMatch(adminWaiting, />開出發票</);

  const adminInvoice = html(
    createElement(DocumentChain, {
      topic: "invoice",
      parent: { id: quoteId, topic: "quote" },
      child: null,
      hrefFor: adminRequestPath,
      startHref: adminFollowUpPath(invoiceId),
      actionNote: adminCanOpenReceipt("甲工程公司"),
    }),
  );
  assert.match(adminInvoice, /你可以為甲工程公司開出收據/);
  assert.match(adminInvoice, /開出收據/);
  assert.match(adminInvoice, new RegExp(`href="${adminFollowUpPath(invoiceId)}"`));
  assert.match(adminInvoice, /原本的出發票不會更改事項、狀態、訊息或檔案/);
  assert.doesNotMatch(adminInvoice, /尚未開出收據/);

  const adminHasReceipt = html(
    createElement(DocumentChain, {
      topic: "invoice",
      parent: null,
      child: { id: receiptId, topic: "receipt" },
      hrefFor: adminRequestPath,
      startHref: adminFollowUpPath(invoiceId),
      actionNote: adminCanOpenReceipt("甲工程公司"),
    }),
  );
  assert.match(adminHasReceipt, /已開出收據/);
  assert.match(adminHasReceipt, new RegExp(`href="${adminRequestPath(receiptId)}"`));
  assert.doesNotMatch(adminHasReceipt, /你可以為甲工程公司開出收據/);
  assert.doesNotMatch(adminHasReceipt, new RegExp(`href="${adminFollowUpPath(invoiceId)}"`));

  const receipt = html(
    createElement(DocumentChain, {
      topic: "receipt",
      parent: { id: invoiceId, topic: "invoice" },
      child: null,
      hrefFor: clientRequestPath,
      startHref: clientFollowUpPath(receiptId),
    }),
  );
  assert.match(receipt, /由出發票開出/);
  assert.match(receipt, new RegExp(`href="${clientRequestPath(invoiceId)}"`));
  assert.doesNotMatch(receipt, /開出收據|尚未開|\/next/);

  assert.equal(
    html(
      createElement(DocumentChain, {
        topic: "other",
        parent: null,
        child: null,
        hrefFor: clientRequestPath,
        startHref: clientFollowUpPath(quoteId),
      }),
    ),
    "",
  );
  assert.equal(
    html(
      createElement(DocumentChain, {
        topic: "receipt",
        parent: null,
        child: null,
        hrefFor: clientRequestPath,
        startHref: null,
      }),
    ),
    "",
  );
});

test("the request list shows the quotation linked to a later invoice", () => {
  const markup = html(
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
  const items = markup.split("<li").slice(1);
  assert.equal(items.length, 2);
  assert.match(items[0] ?? "", /出報價單/);
  assert.match(items[0] ?? "", /九龍灣地盤/);
  assert.match(items[0] ?? "", /已開出發票/);
  assert.match(items[0] ?? "", new RegExp(`href="${clientRequestPath(invoiceId)}"`));
  assert.match(items[0] ?? "", new RegExp(`href="${clientRequestPath(quoteId)}"`));
  assert.match(items[1] ?? "", /出發票/);
  assert.match(items[1] ?? "", /由出報價單開出/);
  assert.match(items[1] ?? "", new RegExp(`href="${clientRequestPath(quoteId)}"`));
  assert.doesNotMatch(markup, /開出收據|其他/);
});

test("after an invoice status change, the admin is prompted to open one receipt", () => {
  const openReceipt = html(
    createElement(InvoiceReceiptPrompt, {
      companyName: "甲工程公司",
      child: null,
      startHref: adminFollowUpPath(invoiceId),
      hrefFor: adminRequestPath,
    }),
  );
  assert.match(openReceipt, /狀態已更新，並寫進時間線/);
  assert.match(openReceipt, /你可以為甲工程公司開出收據/);
  assert.match(openReceipt, /工作地點和內容會從這張發票帶過去/);
  assert.match(openReceipt, new RegExp(`href="${adminFollowUpPath(invoiceId)}"`));
  assert.match(openReceipt, />開出收據</);
  assert.doesNotMatch(openReceipt, /不會再開一張/);

  const existing = html(
    createElement(InvoiceReceiptPrompt, {
      companyName: "甲工程公司",
      child: { id: receiptId, topic: "receipt" },
      startHref: adminFollowUpPath(invoiceId),
      hrefFor: adminRequestPath,
    }),
  );
  assert.match(existing, /狀態已更新，並寫進時間線/);
  assert.match(existing, /已為甲工程公司開出的收據/);
  assert.match(existing, /不會再開一張/);
  assert.match(existing, new RegExp(`href="${adminRequestPath(receiptId)}"`));
  assert.doesNotMatch(existing, new RegExp(`href="${adminFollowUpPath(invoiceId)}"`));
  assert.doesNotMatch(existing, />開出收據</);
});

test("starting the next document does not rewrite the original request", () => {
  const action = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const adminAction = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const linkedRequest = readFileSync(new URL("./linked-request.ts", import.meta.url), "utf8");
  const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const follow = readFileSync(new URL("../app/client/(portal)/requests/[id]/next/page.tsx", import.meta.url), "utf8");
  const adminFollow = readFileSync(new URL("../app/admin/(desk)/requests/[id]/next/page.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../app/admin/(desk)/page.tsx", import.meta.url), "utf8");
  const linked = action.slice(
    action.indexOf("export async function prepareLinkedRequest"),
    action.indexOf("export async function prepareClientReply"),
  );
  const adminLinked = adminAction.slice(
    adminAction.indexOf("export async function prepareAdminLinkedReceipt"),
    adminAction.indexOf("export async function deleteRequest"),
  );
  const created = action.slice(
    action.indexOf("export async function prepareClientRequest"),
    action.indexOf("export async function prepareLinkedRequest"),
  );

  assert.match(action, /insert into requests \(client_id, topic, work_location\)/);
  assert.match(linkedRequest, /insert into requests \(client_id, topic, work_location, parent_request_id\)/);
  assert.match(linkedRequest, /authorRole: "client"/);
  assert.match(linkedRequest, /23505/);
  assert.doesNotMatch(linkedRequest, /update\s+(public\.)?requests/i);
  assert.match(linked, /insertLinkedRequest/);
  assert.match(linked, /topic: next/);
  assert.match(linked, /parseWorkLocation/);
  assert.doesNotMatch(linked, /請填寫內容，或上載至少一個檔案/);
  assert.doesNotMatch(linked, /update\s+(public\.)?requests/i);
  assert.doesNotMatch(linked, /signOut|destroyCurrentSession/);
  assert.match(created, /請填寫內容，或上載至少一個檔案/);

  assert.match(adminLinked, /parentTopic !== "invoice"/);
  assert.match(adminLinked, /topic: "receipt"/);
  assert.match(adminLinked, /insertLinkedRequest/);
  assert.match(adminLinked, /parseWorkLocation/);
  assert.doesNotMatch(adminLinked, /請填寫內容，或上載至少一個檔案/);
  assert.doesNotMatch(adminLinked, /update\s+(public\.)?requests/i);
  assert.doesNotMatch(adminLinked, /signOut|destroyCurrentSession/);
  assert.match(adminAction, /requireAdmin/);

  assert.match(data, /author_role = 'client'/);
  assert.match(data, /order by m\.created_at asc, m\.id asc/);
  assert.match(data, /openingClientContent/);

  assert.match(composer, /prepareLinkedRequest/);
  assert.match(composer, /prepareAdminLinkedReceipt/);
  assert.match(composer, /initialWorkLocation/);
  assert.match(composer, /useState\(initialBody\)/);
  assert.match(composer, /requestContentRequired\(mode\)/);
  assert.match(composer, /followUpPlaceholder/);
  assert.match(composer, /followUpEmptyPlaceholder/);
  assert.match(
    composer,
    /if \(audience === "client" && mode === "follow"\) \{\s*const navigation = navigationAfterCreate\(prepared\.redirectTo\);\s*window\.location\.replace\(navigation\.href\);\s*return;\s*\}/,
  );
  assert.match(
    composer,
    /if \(audience === "admin" && mode === "follow"\) \{\s*window\.location\.replace\(prepared\.redirectTo\);\s*return;\s*\}/,
  );
  assert.doesNotMatch(composer, /signOut|destroyCurrentSession/);

  assert.match(follow, /mode="follow"/);
  assert.match(follow, /initialWorkLocation=\{request\.work_location \?\? ""\}/);
  assert.match(follow, /initialBody=\{opening\}/);
  assert.match(follow, /loadClientOpeningContent/);
  assert.match(follow, /ClientListLink/);
  assert.match(follow, /if \(chain\.child\) redirect/);
  assert.doesNotMatch(follow, /signOut|destroyCurrentSession/);

  assert.match(adminFollow, /mode="follow"/);
  assert.match(adminFollow, /audience="admin"/);
  assert.match(adminFollow, /topic="receipt"/);
  assert.match(adminFollow, /initialBody=\{opening\}/);
  assert.match(adminFollow, /initialWorkLocation=\{request\.work_location \?\? ""\}/);
  assert.match(adminFollow, /loadAdminOpeningContent/);
  assert.match(adminFollow, /request\.topic !== "invoice"/);
  assert.match(adminFollow, /if \(chain\.child\) redirect\(adminRequestPath/);
  assert.doesNotMatch(adminFollow, /signOut|destroyCurrentSession/);

  assert.match(clientPage, /startHref=\{clientFollowUpPath\(request\.id\)\}/);
  assert.match(clientPage, /<DocumentChain/);
  assert.match(adminPage, /startHref=\{request\.topic === "invoice" \? adminFollowUpPath\(request\.id\) : null\}/);
  assert.match(adminPage, /adminCanOpenReceipt\(client\.company_name\)/);
  assert.match(adminPage, /InvoiceReceiptPrompt/);
  assert.match(adminPage, /query\.notice === "status" && request\.topic === "invoice"/);
  assert.match(adminPage, /<DocumentChain/);
  assert.match(desk, /<RequestChainLinks/);
  assert.match(desk, /adminRequestPath/);
});
