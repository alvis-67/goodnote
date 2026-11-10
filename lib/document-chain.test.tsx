import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientRequestList } from "../components/client-request-list";
import { DocumentChain } from "../components/document-chain";
import type { RequestRow } from "./database.types";
import {
  canFollowDocument,
  chainDuplicateError,
  followUpIntro,
  followUpPlaceholder,
  nextDocumentTopic,
} from "./document-chain";
import { clientFollowUpPath, clientRequestPath } from "./paths";

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
  assert.match(followUpIntro("quote", "invoice", true), /出報價單/);
  assert.match(followUpIntro("quote", "invoice", true), /出發票/);
  assert.match(followUpIntro("quote", "invoice", true), /維持不變/);
  assert.match(followUpIntro("quote", "invoice", true), /工作地點已從原本的請求填上/);
  assert.match(followUpIntro("invoice", "receipt", false), /請填寫工作地點/);
  assert.doesNotMatch(followUpIntro("invoice", "receipt", false), /已從原本的請求填上/);
  assert.equal(chainDuplicateError("invoice"), "已經有出發票，不會再開一張。");
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

test("starting the next document does not rewrite the original request", () => {
  const action = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const follow = readFileSync(new URL("../app/client/(portal)/requests/[id]/next/page.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../app/admin/(desk)/page.tsx", import.meta.url), "utf8");
  const linked = action.slice(
    action.indexOf("export async function prepareLinkedRequest"),
    action.indexOf("export async function prepareClientReply"),
  );

  assert.match(action, /insert into requests \(client_id, topic, work_location\)/);
  assert.match(linked, /insert into requests \(client_id, topic, work_location, parent_request_id\)/);
  assert.match(linked, /\$\{next\}/);
  assert.match(linked, /parseWorkLocation/);
  assert.match(linked, /23505/);
  assert.doesNotMatch(linked, /update\s+(public\.)?requests/i);
  assert.doesNotMatch(linked, /signOut|destroyCurrentSession/);

  assert.match(composer, /prepareLinkedRequest/);
  assert.match(composer, /initialWorkLocation/);
  assert.match(composer, /followUpPlaceholder/);
  assert.match(
    composer,
    /if \(audience === "client" && mode === "follow"\) \{\s*const navigation = navigationAfterCreate\(prepared\.redirectTo\);\s*window\.location\.replace\(navigation\.href\);\s*return;\s*\}/,
  );
  assert.doesNotMatch(composer, /signOut|destroyCurrentSession/);

  assert.match(follow, /mode="follow"/);
  assert.match(follow, /initialWorkLocation=\{request\.work_location \?\? ""\}/);
  assert.match(follow, /ClientListLink/);
  assert.match(follow, /if \(chain\.child\) redirect/);
  assert.doesNotMatch(follow, /signOut|destroyCurrentSession/);

  assert.match(clientPage, /startHref=\{clientFollowUpPath\(request\.id\)\}/);
  assert.match(clientPage, /<DocumentChain/);
  assert.match(adminPage, /startHref=\{null\}/);
  assert.match(adminPage, /<DocumentChain/);
  assert.match(desk, /<RequestChainLinks/);
  assert.match(desk, /adminRequestPath/);
});
