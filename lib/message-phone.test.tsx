import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Thread } from "../components/thread";
import type { MessageRow } from "./database.types";
import { splitHongKongPhoneText, type HongKongPhonePart } from "./phone";

function joined(parts: HongKongPhonePart[]): string {
  return parts.map((part) => part.text).join("");
}

function phonesIn(input: string): string[] {
  return splitHongKongPhoneText(input)
    .filter((part) => part.type === "phone")
    .map((part) => part.text);
}

test("Hong Kong numbers are found in message text and the other words stay put", () => {
  const samples: Array<{ input: string; phones: string[] }> = [
    { input: "請打91234567謝謝", phones: ["91234567"] },
    { input: "請打 9123 4567 謝謝", phones: ["9123 4567"] },
    { input: "請打 9123-4567 謝謝", phones: ["9123-4567"] },
    { input: "請打 9123  4567。", phones: ["9123  4567"] },
    { input: "請打 9123 - 4567。", phones: ["9123 - 4567"] },
    { input: "電話+852 9123 4567。", phones: ["+852 9123 4567"] },
    { input: "電話+852-9123-4567。", phones: ["+852-9123-4567"] },
    { input: "電話+85291234567。", phones: ["+85291234567"] },
    { input: "電話 +852 91234567 謝謝", phones: ["+852 91234567"] },
    { input: "電話+ 852 9123 4567。", phones: ["+ 852 9123 4567"] },
    { input: "電話852 9123 4567。", phones: ["852 9123 4567"] },
    { input: "電話852-9123-4567。", phones: ["852-9123-4567"] },
    { input: "電話85291234567。", phones: ["85291234567"] },
    { input: "電話852 91234567。", phones: ["852 91234567"] },
    { input: "兩個：91234567 及 6123-4567。", phones: ["91234567", "6123-4567"] },
    { input: "9123 4567 6123 4567", phones: ["9123 4567", "6123 4567"] },
    { input: "91234567 61234567", phones: ["91234567", "61234567"] },
    { input: "前文\n9123-4567\n後文", phones: ["9123-4567"] },
    { input: "(9123 4567)", phones: ["9123 4567"] },
    { input: "abc91234567def", phones: ["91234567"] },
    { input: "本地號碼85291234是八位。", phones: ["85291234"] },
    { input: "先打91234567，單號123456789012。", phones: ["91234567"] },
    { input: "單號123456789012，電話9123 4567。", phones: ["9123 4567"] },
    { input: "短碼 99 91234567 完", phones: ["91234567"] },
    { input: "訂單123456789不用打", phones: [] },
    { input: "訂單912345678不用打", phones: [] },
    { input: "訂單123456789012不用打", phones: [] },
    { input: "訂單852912345678不用打", phones: [] },
    { input: "訂單1234-5678-9012不用打", phones: [] },
    { input: "訂單1234 5678 9012不用打", phones: [] },
    { input: "只有七位1234567", phones: [] },
    { input: "852 9123 不夠", phones: [] },
    { input: "日期 2024-11-12 開工", phones: [] },
    { input: "+86 13812345678", phones: [] },
    { input: "沒有號碼", phones: [] },
  ];

  for (const sample of samples) {
    const parts = splitHongKongPhoneText(sample.input);
    assert.equal(joined(parts), sample.input, sample.input);
    assert.deepEqual(phonesIn(sample.input), sample.phones, sample.input);
  }

  const mixed = splitHongKongPhoneText("請打 9123 4567，單號 123456789。");
  assert.deepEqual(
    mixed.map((part) => part.type),
    ["text", "phone", "text"],
  );
  assert.equal(mixed[0]?.text, "請打 ");
  assert.equal(mixed[2]?.text, "，單號 123456789。");
});

function message(partial: Pick<MessageRow, "id" | "body" | "author_role">): MessageRow {
  return {
    id: partial.id,
    request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    author_role: partial.author_role,
    kind: "message",
    body: partial.body,
    status_from: null,
    status_to: null,
    stage_from: null,
    stage_to: null,
    created_at: "2026-11-10T02:00:00.000Z",
  };
}

test("the request thread renders each written number as a call and copy control", () => {
  const markup = renderToStaticMarkup(
    createElement(Thread, {
      attachments: [],
      messages: [
        message({
          id: "client-note",
          author_role: "client",
          body: "師傅請打 9123 4567 或 +852-6123-4567，訂單 123456789 不用理。",
        }),
        message({
          id: "admin-note",
          author_role: "admin",
          body: "已收，可再打 852 91234567。",
        }),
        message({
          id: "plain-note",
          author_role: "client",
          body: "泥水做好了",
        }),
      ],
    }),
  );

  assert.match(markup, /href="tel:91234567"/);
  assert.match(markup, /href="tel:\+85261234567"|href="tel:&#43;85261234567"/);
  assert.match(markup, /href="tel:85291234567"/);
  assert.doesNotMatch(markup, /tel:123456789/);
  assert.match(markup, /aria-label="致電 9123 4567"/);
  assert.match(markup, /aria-label="複製 9123 4567"/);
  assert.match(markup, /aria-label="致電 \+852-6123-4567"|aria-label="致電 &#43;852-6123-4567"/);
  assert.match(markup, /aria-label="複製 \+852-6123-4567"|aria-label="複製 &#43;852-6123-4567"/);
  assert.match(markup, /aria-label="致電 852 91234567"/);
  assert.match(markup, /aria-label="複製 852 91234567"/);
  assert.equal(markup.match(/複製號碼/g)?.length, 3);
  assert.equal(markup.match(/type="button"/g)?.length, 3);
  assert.match(markup, /text-navy/);
  assert.match(markup, /bg-white/);
  assert.match(markup, /underline/);
  assert.match(markup, /師傅請打 /);
  assert.match(markup, / 或 /);
  assert.match(markup, /，訂單 123456789 不用理。/);
  assert.match(markup, /已收，可再打 /);
  assert.match(markup, /泥水做好了/);
  assert.doesNotMatch(markup, /已複製|未能複製號碼/);
  const plain = markup.slice(markup.lastIndexOf("泥水做好了") - 80, markup.lastIndexOf("泥水做好了") + 20);
  assert.doesNotMatch(plain, /tel:|複製號碼/);
});
