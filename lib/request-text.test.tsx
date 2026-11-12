import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NumberActions } from "../components/number-actions";
import { RequestBreakdown } from "../components/request-breakdown";
import { Thread } from "../components/thread";
import type { MessageRow } from "./database.types";
import type { TopicId } from "./domain";
import {
  itemGroups,
  parseRequestText,
  requestSourceText,
  topicNote,
  worksiteToShow,
  type ParsedItem,
} from "./request-text";

const INVOICE = [
  "出單收錢",
  "添喜家居維修冷氣工",
  "程公司",
  "翁先生",
  "54292094",
  "將軍澳中心11座28樓A室",
  "8呎冷氣棚$2800",
  "保險加名$1380",
].join("\n");

const QUOTE = [
  "出報價單比我",
  "西貢區安愉道12號安秀苑安俊閣2307室",
  "55342600",
  "Maggie Chung",
  "搭及拆棚連更換U型隔氣一個連工包料",
  "$3300",
  "保險加名$1380",
  "總數$4680",
  "",
  "備註加條款",
  "以上報價內容沒有額外費用，除非有後加此報價以外的項目，需另外報價",
].join("\n");

const MANAGEMENT = ["柏傲灣1B座39B", "管理處電話22052300", "處理搭棚申請文件"].join("\n");

const FAX = [
  "單位：裕民中心2座10樓C",
  "麻煩今日下午5點前Fax資料俾管理處",
  "管理處傳真：23450631",
  "管理處電話：",
  "23450371",
].join("\n");

const UNCLEAR = [
  "Sunny City Limited.  雲咸街71號雲山大廈2402",
  "曾生",
  "93616211",
  "8呎水喉棚",
  "維修去水喉",
  "$5500",
].join("\n");

function itemsOf(text: string): ParsedItem[] {
  return parseRequestText(text).items;
}

function renderBreakdown(text: string, currentTopic: TopicId, audience: "admin" | "client" = "admin"): string {
  return renderToStaticMarkup(
    createElement(RequestBreakdown, {
      parsed: parseRequestText(text),
      currentTopic,
      audience,
    }),
  );
}

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

test("an invoice paste is one request, with the company line break joined", () => {
  const source = INVOICE;
  const parsed = parseRequestText(source);
  assert.equal(source, INVOICE);
  assert.equal("requests" in parsed, false);
  assert.equal(parsed.topic, "invoice");
  assert.equal(parsed.topicConfidence, "clear");
  assert.notEqual(parsed.topic, "receipt");
  assert.equal(parsed.company, "添喜家居維修冷氣工程公司");
  assert.equal(parsed.contact, "翁先生");
  assert.deepEqual(parsed.phones, [{ role: "contact", text: "54292094" }]);
  assert.deepEqual(parsed.faxes, []);
  assert.equal(parsed.worksite, "將軍澳中心11座28樓A室");
  assert.equal(parsed.total, null);
  assert.equal(parsed.remarks, null);
  assert.deepEqual(itemsOf(INVOICE), [
    { description: "8呎冷氣棚", amount: 2800, shared: false },
    { description: "保險加名", amount: 1380, shared: false },
  ]);
  assert.equal(parsed.items.length, 2);
});

test("a quotation paste keeps the explicit topic, the total, and the remarks", () => {
  const parsed = parseRequestText(QUOTE);
  assert.equal(parsed.topic, "quote");
  assert.equal(parsed.topicConfidence, "clear");
  assert.notEqual(parsed.topic, "invoice");
  assert.notEqual(parsed.topic, "insurance");
  assert.equal(parsed.worksite, "西貢區安愉道12號安秀苑安俊閣2307室");
  assert.deepEqual(parsed.phones, [{ role: "contact", text: "55342600" }]);
  assert.equal(parsed.contact, "Maggie Chung");
  assert.equal(parsed.company, null);
  assert.deepEqual(parsed.items, [
    { description: "搭及拆棚連更換U型隔氣一個連工包料", amount: 3300, shared: false },
    { description: "保險加名", amount: 1380, shared: false },
  ]);
  assert.equal(parsed.items.some((item) => item.description.includes("總數")), false);
  assert.equal(parsed.total, 4680);
  assert.equal(parsed.remarks, "以上報價內容沒有額外費用，除非有後加此報價以外的項目，需另外報價");
  assert.equal(parsed.items.some((item) => (parsed.remarks ?? "").includes(item.description)), false);
});

test("a management-office paste labels the office number and does not treat it as the client's phone", () => {
  const parsed = parseRequestText(MANAGEMENT);
  assert.equal(parsed.topic, "management");
  assert.equal(parsed.topicConfidence, "clear");
  assert.equal(parsed.worksite, "柏傲灣1B座39B");
  assert.equal(parsed.matter, "處理搭棚申請文件");
  assert.deepEqual(parsed.phones, [{ role: "management", text: "22052300" }]);
  assert.deepEqual(
    parsed.phones.filter((phone) => phone.role === "contact"),
    [],
  );
  assert.deepEqual(parsed.faxes, []);
  assert.equal(parsed.company, null);
  assert.equal(parsed.contact, null);
  assert.deepEqual(parsed.items, []);
});

test("a fax stays a fax, and the office phone on the next line stays a phone", () => {
  const parsed = parseRequestText(FAX);
  assert.equal(parsed.topic, "management");
  assert.equal(parsed.topicConfidence, "clear");
  assert.equal(parsed.worksite, "裕民中心2座10樓C");
  assert.equal(parsed.matter, "麻煩今日下午5點前Fax資料俾管理處");
  assert.equal(parsed.deadline, "今日下午5點前");
  assert.deepEqual(parsed.faxes, [{ role: "management", text: "23450631" }]);
  assert.deepEqual(parsed.phones, [{ role: "management", text: "23450371" }]);
  assert.equal(
    parsed.phones.some((phone) => phone.text === "23450631"),
    false,
  );
});

test("an unclear paste splits the company from the address and shares one amount", () => {
  const parsed = parseRequestText(UNCLEAR);
  assert.equal(parsed.topic, null);
  assert.equal(parsed.topicConfidence, "low");
  assert.equal(parsed.suggestion, "quote");
  assert.notEqual(parsed.topic, "invoice");
  assert.notEqual(parsed.topic, "receipt");
  assert.equal(parsed.company, "Sunny City Limited");
  assert.equal(parsed.worksite, "雲咸街71號雲山大廈2402");
  assert.equal(parsed.contact, "曾生");
  assert.deepEqual(parsed.phones, [{ role: "contact", text: "93616211" }]);
  assert.deepEqual(parsed.items, [
    { description: "8呎水喉棚", amount: 5500, shared: true },
    { description: "維修去水喉", amount: 5500, shared: true },
  ]);
  assert.equal(parsed.items.some((item) => item.amount === 2750), false);
  assert.deepEqual(itemGroups(parsed.items), [
    { descriptions: ["8呎水喉棚", "維修去水喉"], amount: 5500, shared: true },
  ]);
});

test("explicit wording beats a price list, and 收錢 is not a receipt", () => {
  const collect = parseRequestText("收錢\n翁先生\n54292094");
  assert.equal(collect.topic, "invoice");
  assert.notEqual(collect.topic, "receipt");

  const received = parseRequestText("已收錢，請出收據\n翁先生\n54292094");
  assert.equal(received.topic, "receipt");
  assert.equal(parseRequestText("出收據\n54000000").topic, "receipt");

  const quoted = parseRequestText("出報價單比我\n8呎冷氣棚$2800\n保險加名$1380\n總數$4180");
  assert.equal(quoted.topic, "quote");
  assert.equal(quoted.total, 4180);
  assert.equal(quoted.items.length, 2);
  assert.notEqual(quoted.topic, "insurance");

  const pricedOnly = parseRequestText("8呎冷氣棚$2800\n保險加名$1380");
  assert.equal(pricedOnly.topic, null);
  assert.equal(pricedOnly.topicConfidence, "low");
  assert.equal(pricedOnly.suggestion, "quote");
  assert.notEqual(pricedOnly.topic, "invoice");
  assert.notEqual(pricedOnly.topic, "receipt");
  assert.notEqual(pricedOnly.topic, "insurance");

  const buying = parseRequestText("買保險\n陳先生\n91234567");
  assert.equal(buying.topic, "insurance");
  assert.equal(buying.contact, "陳先生");
  assert.deepEqual(buying.phones, [{ role: "contact", text: "91234567" }]);

  const officeOnAQuote = parseRequestText("出報價單比我\n管理處電話22052300\n搭棚$1000");
  assert.equal(officeOnAQuote.topic, "quote");
  assert.deepEqual(officeOnAQuote.phones, [{ role: "management", text: "22052300" }]);
});

test("a total on the next line and a remark that contains a price stay out of the items", () => {
  const parsed = parseRequestText(["出報價單比我", "搭棚", "$1000", "總數", "$1000", "", "備註加條款", "額外$500不算項目"].join("\n"));
  assert.deepEqual(parsed.items, [{ description: "搭棚", amount: 1000, shared: false }]);
  assert.equal(parsed.total, 1000);
  assert.equal(parsed.remarks, "額外$500不算項目");
});

test("Hong Kong phone shapes are read, and a longer digit run is not a phone or a fax", () => {
  const spaced = parseRequestText("出報價單比我\n+852 5534 2600");
  assert.deepEqual(spaced.phones, [{ role: "contact", text: "+852 5534 2600" }]);

  const hyphen = parseRequestText("出報價單比我\n852-5534-2600");
  assert.deepEqual(hyphen.phones, [{ role: "contact", text: "852-5534-2600" }]);

  const local = parseRequestText("出報價單比我\n5534-2600");
  assert.deepEqual(local.phones, [{ role: "contact", text: "5534-2600" }]);

  const mixed = parseRequestText("出報價單比我\n單號123456789012，電話9123 4567。\n訂單123456789012\n1234 5678 9012\n+86 13812345678");
  assert.deepEqual(mixed.phones, [{ role: "contact", text: "9123 4567" }]);
  assert.deepEqual(mixed.faxes, []);
  assert.equal(JSON.stringify(mixed).includes("123456789012"), false);
  assert.equal(JSON.stringify(mixed).includes("13812345678"), false);
});

test("the saved worksite and the first client message are left as they are", () => {
  assert.equal(worksiteToShow("九龍灣地盤", "將軍澳中心11座28樓A室"), "九龍灣地盤");
  assert.equal(worksiteToShow("  九龍灣地盤  ", "將軍澳中心11座28樓A室"), "九龍灣地盤");
  assert.equal(worksiteToShow("  ", "將軍澳中心11座28樓A室"), "將軍澳中心11座28樓A室");
  assert.equal(worksiteToShow(null, null), null);

  const messages = [
    { kind: "message", author_role: "admin", body: "出收據\n99999999" },
    { kind: "message", author_role: "client", body: INVOICE },
    { kind: "message", author_role: "client", body: "第二則不應該拆成另一張單" },
    { kind: "stage_change", author_role: "system", body: "階段由出報價單改為出發票" },
  ];
  assert.equal(requestSourceText(messages), INVOICE);
  assert.equal(requestSourceText([{ kind: "message", author_role: "admin", body: QUOTE }]), null);
  assert.equal(parseRequestText("").suggestion, null);
});

test("the summary shows the structured fields and omits the empty ones", () => {
  const invoice = renderBreakdown(INVOICE, "invoice");
  assert.match(invoice, /內容摘要/);
  assert.match(invoice, /添喜家居維修冷氣工程公司/);
  assert.match(invoice, /翁先生/);
  assert.match(invoice, /聯絡電話/);
  assert.match(invoice, /href="tel:54292094"/);
  assert.match(invoice, /複製號碼/);
  assert.match(invoice, /將軍澳中心11座28樓A室/);
  assert.match(invoice, /8呎冷氣棚/);
  assert.match(invoice, /\$2800/);
  assert.match(invoice, /保險加名/);
  assert.match(invoice, /\$1380/);
  assert.doesNotMatch(invoice, /建議事項|事項未明確|共用|總數|備註|管理處/);
  assert.doesNotMatch(invoice, /<form|name="topic"/);

  const quoted = renderBreakdown(QUOTE, "quote");
  const items = quoted.slice(quoted.indexOf("項目"), quoted.indexOf("總數"));
  assert.match(items, /搭及拆棚連更換U型隔氣一個連工包料/);
  assert.match(items, /\$3300/);
  assert.match(items, /保險加名/);
  assert.match(items, /\$1380/);
  assert.doesNotMatch(items, /4680|以上報價|總數/);
  assert.match(quoted, /總數/);
  assert.match(quoted, /\$4680/);
  assert.equal(quoted.match(/\$4680/g)?.length, 1);
  assert.match(quoted, /備註/);
  assert.match(quoted, /以上報價內容沒有額外費用，除非有後加此報價以外的項目，需另外報價/);
  assert.match(quoted, /Maggie Chung/);
  assert.match(quoted, /href="tel:55342600"/);
  assert.doesNotMatch(quoted, /建議事項|事項未明確|公司/);

  const office = renderBreakdown(MANAGEMENT, "management");
  assert.match(office, /管理處電話/);
  assert.match(office, /href="tel:22052300"/);
  assert.match(office, /柏傲灣1B座39B/);
  assert.match(office, /事宜/);
  assert.match(office, /處理搭棚申請文件/);
  assert.doesNotMatch(office, /聯絡電話|公司|聯絡人|項目|總數|備註|傳真/);

  const fax = renderBreakdown(FAX, "management");
  assert.match(fax, /裕民中心2座10樓C/);
  assert.match(fax, /期限/);
  assert.match(fax, /今日下午5點前/);
  assert.match(fax, /事宜/);
  assert.match(fax, /麻煩今日下午5點前Fax資料俾管理處/);
  assert.match(fax, /管理處傳真/);
  assert.match(fax, /23450631/);
  assert.match(fax, /複製傳真/);
  assert.doesNotMatch(fax, /href="[^"]*23450631|tel:23450631/);
  assert.match(fax, /管理處電話/);
  assert.match(fax, /href="tel:23450371"/);
  assert.doesNotMatch(fax, /聯絡電話/);

  const unclear = renderBreakdown(UNCLEAR, "invoice", "client");
  assert.match(unclear, /事項未明確，請人手選擇。僅供參考：出報價單。/);
  assert.match(unclear, /Sunny City Limited/);
  assert.match(unclear, /雲咸街71號雲山大廈2402/);
  assert.match(unclear, /曾生/);
  assert.match(unclear, /href="tel:93616211"/);
  assert.match(unclear, /8呎水喉棚/);
  assert.match(unclear, /維修去水喉/);
  assert.match(unclear, /\$5500/);
  assert.match(unclear, /共用/);
  assert.equal(unclear.match(/\$5500/g)?.length, 1);
  assert.doesNotMatch(unclear, /2750|建議事項：出報價單|出發票|出收據/);
  assert.equal(renderToStaticMarkup(createElement(RequestBreakdown, {
    parsed: parseRequestText(""),
    currentTopic: "quote",
    audience: "admin",
  })), "");
});

test("a clear topic that differs is only a suggestion, and an unclear topic stays unclear", () => {
  const suggested = topicNote(parseRequestText(INVOICE), "quote", "admin");
  assert.match(suggested ?? "", /建議事項：出發票/);
  assert.match(suggested ?? "", /目前事項是出報價單/);
  assert.match(suggested ?? "", /不會自動更改事項或階段/);
  assert.equal(topicNote(parseRequestText(INVOICE), "invoice", "admin"), null);
  assert.equal(topicNote(parseRequestText(INVOICE), "quote", "client"), null);

  const unclear = topicNote(parseRequestText(UNCLEAR), "invoice", "admin");
  assert.match(unclear ?? "", /事項未明確/);
  assert.match(unclear ?? "", /僅供參考：出報價單/);
  assert.doesNotMatch(unclear ?? "", /建議事項：出發票|建議事項：出收據/);

  const html = renderBreakdown(INVOICE, "quote");
  assert.match(html, /建議事項：出發票/);
  assert.match(html, /不會自動更改/);
  assert.doesNotMatch(html, /<form|type="submit"|name="topic"/);
});

test("a fax control can be copied and is not a call link", () => {
  const fax = renderToStaticMarkup(createElement(NumberActions, { value: "23450631", mode: "copy" }));
  assert.match(fax, /23450631/);
  assert.match(fax, /複製傳真/);
  assert.match(fax, /aria-label="複製傳真 23450631"/);
  assert.doesNotMatch(fax, /<a |tel:|致電/);

  const phone = renderToStaticMarkup(createElement(NumberActions, { value: "5429 2094", mode: "call" }));
  assert.match(phone, /href="tel:54292094"/);
  assert.match(phone, /複製號碼/);
  assert.match(phone, />5429 2094</);
});

test("the original thread text and its phone controls stay intact", () => {
  const thread = renderToStaticMarkup(
    createElement(Thread, {
      attachments: [],
      messages: [
        message({ id: "invoice", author_role: "client", body: INVOICE }),
        message({ id: "fax", author_role: "client", body: FAX }),
      ],
    }),
  );
  assert.match(thread, /冷氣工/);
  assert.match(thread, /程公司/);
  assert.doesNotMatch(thread, /添喜家居維修冷氣工程公司/);
  assert.match(thread, /href="tel:54292094"/);
  assert.match(thread, /href="tel:23450631"/);
  assert.match(thread, /href="tel:23450371"/);
  assert.match(thread, /複製號碼/);
  assert.match(thread, /麻煩今日下午5點前Fax資料俾管理處/);
  assert.doesNotMatch(thread, /內容摘要|建議事項|事項未明確/);

  const summary = renderBreakdown(INVOICE, "invoice");
  assert.match(summary, /添喜家居維修冷氣工程公司/);
});

test("request pages show the summary without restoring the client composer or the profile phone", () => {
  const admin = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const thread = readFileSync(new URL("../components/thread.tsx", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");

  assert.match(admin, /<RequestBreakdown parsed=\{parsed\} currentTopic=\{request\.topic\} audience="admin" \/>/);
  assert.match(admin, /\{client\.phone \? <ClientPhone phone=\{client\.phone\} \/> : null\}/);
  assert.match(admin, /<Thread messages=\{thread\.messages\} attachments=\{thread\.attachments\} \/>/);
  assert.match(admin, /<Composer audience="admin" mode="reply" requestId=\{request\.id\} presets=\{presets\} \/>/);
  assert.match(client, /<RequestBreakdown parsed=\{parsed\} currentTopic=\{request\.topic\} audience="client" \/>/);
  assert.match(client, /<Thread messages=\{thread\.messages\} attachments=\{thread\.attachments\} \/>/);
  assert.doesNotMatch(client, /Composer|prepareClientReply|補充或回覆|ClientPhone|tel:|client\.phone/);
  assert.match(thread, /<MessageBody text=\{message\.body\} mine=\{mine\} \/>/);
  assert.doesNotMatch(composer, /prepareClientReply/);
  assert.doesNotMatch(admin, /set topic|update requests set topic/i);
  assert.doesNotMatch(client, /set topic|update requests set topic/i);
});
