import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CreateRequestInsights } from "../components/create-request-insights";
import { TopicRuleEditor } from "../components/topic-rule-editor";
import { parseRequestText } from "./request-text";
import {
  DEFAULT_TOPIC_RULES,
  TOPIC_CHOICE_PROMPT,
  TOPIC_CLASSIFY_PAUSE_MS,
  classifySchedule,
  classifyTopicWithRules,
  commitDeleteTopicRule,
  commitNewTopicRule,
  initialTopicSelection,
  nextWorksiteValue,
  rulesAfterDelete,
  rulesAfterSave,
  selectTopicManually,
  topicChoicePrompt,
  topicChoiceStatus,
  topicPhrasesForClient,
  topicSelectionAfterMatch,
  type TopicPhraseRule,
  type TopicRuleRecord,
} from "./topic-rules";

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

const rules: readonly TopicPhraseRule[] = DEFAULT_TOPIC_RULES;

function records(phrases: readonly TopicPhraseRule[]): TopicRuleRecord[] {
  return phrases.map((rule, index) => ({ ...rule, id: `rule-${index}` }));
}

test("the five agreed pastes keep one topic and the same summary fields", () => {
  assert.equal(classifyTopicWithRules(INVOICE, rules), "invoice");
  assert.equal(parseRequestText(INVOICE).topic, "invoice");
  assert.equal(parseRequestText(INVOICE).company, "添喜家居維修冷氣工程公司");
  assert.notEqual(classifyTopicWithRules(INVOICE, rules), "insurance");
  assert.notEqual(classifyTopicWithRules(INVOICE, rules), "receipt");

  assert.equal(classifyTopicWithRules(QUOTE, rules), "quote");
  assert.equal(parseRequestText(QUOTE).topic, "quote");
  assert.equal(parseRequestText(QUOTE).total, 4680);
  assert.notEqual(classifyTopicWithRules(QUOTE, rules), "insurance");
  assert.notEqual(classifyTopicWithRules(QUOTE, rules), "invoice");

  assert.equal(MANAGEMENT.includes("搵"), false);
  assert.equal(classifyTopicWithRules(MANAGEMENT, rules), "management");
  assert.equal(parseRequestText(MANAGEMENT).topic, "management");
  assert.equal(parseRequestText(MANAGEMENT).phones[0]?.text, "22052300");

  assert.equal(FAX.includes("搵"), false);
  assert.equal(classifyTopicWithRules(FAX, rules), "management");
  assert.equal(parseRequestText(FAX).topic, "management");
  assert.equal(parseRequestText(FAX).faxes[0]?.text, "23450631");

  assert.equal(classifyTopicWithRules(UNCLEAR, rules), null);
  assert.equal(parseRequestText(UNCLEAR).topic, null);
  assert.equal(parseRequestText(UNCLEAR).suggestion, "quote");
  assert.equal(Array.isArray(classifyTopicWithRules(INVOICE, rules)), false);
});

test("explicit wording beats a price, and 已收錢 is not an invoice", () => {
  assert.equal(classifyTopicWithRules("出單收錢", rules), "invoice");
  assert.equal(classifyTopicWithRules("出 單 收 錢", rules), "invoice");
  assert.equal(classifyTopicWithRules("收錢\n翁先生\n54292094", rules), "invoice");
  assert.notEqual(classifyTopicWithRules("收錢", rules), "receipt");

  assert.equal(classifyTopicWithRules("已收錢", rules), "receipt");
  assert.equal(classifyTopicWithRules("已收錢，請出收據", rules), "receipt");
  assert.equal(classifyTopicWithRules("已收妥", rules), "receipt");
  assert.equal(classifyTopicWithRules("已付款", rules), "receipt");
  assert.equal(classifyTopicWithRules("請出收據", rules), "receipt");
  assert.notEqual(classifyTopicWithRules("已收錢", rules), "invoice");

  const withoutReceived = rules.filter((rule) => rule.phrase !== "已收錢");
  assert.notEqual(classifyTopicWithRules("已收錢", withoutReceived), "invoice");
  assert.equal(classifyTopicWithRules("已收錢", withoutReceived), null);
  assert.equal(classifyTopicWithRules("已收錢，請出收據", withoutReceived), "receipt");

  assert.equal(classifyTopicWithRules("出報價單比我\n8呎冷氣棚$2800\n保險加名$1380\n總數$4180", rules), "quote");
  assert.equal(classifyTopicWithRules("8呎冷氣棚$2800\n保險加名$1380", rules), null);
  assert.notEqual(classifyTopicWithRules("8呎冷氣棚$2800\n保險加名$1380", rules), "insurance");
  assert.equal(classifyTopicWithRules("買保險\n陳先生\n91234567", rules), "insurance");

  assert.equal(classifyTopicWithRules("出報價單比我\n管理處電話22052300\n搭棚$1000", rules), "quote");

  const buried = ["出報價單比我", "搭棚$1000", "備註加條款", "請出發票", "已收錢"].join("\n");
  assert.equal(classifyTopicWithRules(buried, rules), "quote");
});

test("office pastes still classify when the exact phrase is not in the rules", () => {
  const withoutOffice = rules.filter((rule) => rule.topic !== "management");
  assert.equal(classifyTopicWithRules(MANAGEMENT, withoutOffice), "management");
  assert.equal(classifyTopicWithRules(FAX, withoutOffice), "management");
  assert.equal(classifyTopicWithRules("到管理處拿鎖匙", withoutOffice), "management");
  assert.equal(classifyTopicWithRules("8呎冷氣棚$2800", withoutOffice), null);
});

test("each seeded phrase maps to its own topic, and 搵 is U+6435", () => {
  const office = DEFAULT_TOPIC_RULES.find((rule) => rule.phrase === "搵管理處");
  assert.equal(office?.topic, "management");
  assert.equal(office?.phrase.codePointAt(0), 0x6435);
  for (const rule of DEFAULT_TOPIC_RULES) {
    assert.equal(classifyTopicWithRules(rule.phrase, rules), rule.topic);
    assert.equal(rule.phrase.includes("僱"), false);
  }
});

test("a matching rule selects the topic, and no match does not guess 出報價單", () => {
  const selected = topicSelectionAfterMatch(initialTopicSelection(), classifyTopicWithRules(INVOICE, rules));
  assert.equal(selected.topic, "invoice");
  assert.equal(selected.manual, null);

  const missed = topicSelectionAfterMatch(initialTopicSelection(), classifyTopicWithRules(UNCLEAR, rules));
  assert.equal(missed.topic, null);
  assert.notEqual(missed.topic, "quote");
  assert.equal(topicChoicePrompt(UNCLEAR, null, null), TOPIC_CHOICE_PROMPT);
  assert.equal(TOPIC_CHOICE_PROMPT.includes("出報價單"), false);
  assert.equal(topicChoiceStatus(null, null), null);
  assert.equal(topicChoiceStatus("invoice", "invoice"), "已按內容選擇出發票。");

  const cleared = topicSelectionAfterMatch(selected, null);
  assert.equal(cleared.topic, null);
});

test("a manual topic stays until the content matches a different rule", () => {
  const auto = topicSelectionAfterMatch(initialTopicSelection(), "invoice");
  const held = selectTopicManually("other", "invoice");
  assert.equal(topicSelectionAfterMatch(held, "invoice").topic, "other");
  assert.equal(topicSelectionAfterMatch(held, null).topic, "other");

  const refreshed = topicSelectionAfterMatch(held, "receipt");
  assert.equal(refreshed.topic, "receipt");
  assert.equal(refreshed.manual, null);

  const chosenFirst = selectTopicManually("quote", null);
  assert.equal(topicSelectionAfterMatch(chosenFirst, null).topic, "quote");
  assert.equal(topicSelectionAfterMatch(chosenFirst, "invoice").topic, "invoice");

  assert.equal(auto.topic, "invoice");
  assert.equal(classifySchedule("paste").delay, 0);
  assert.equal(classifySchedule("input").delay, TOPIC_CLASSIFY_PAUSE_MS);
  assert.ok(TOPIC_CLASSIFY_PAUSE_MS > 0);
  assert.ok(TOPIC_CLASSIFY_PAUSE_MS <= 500);
});

test("an empty worksite takes the parsed address and a typed one stays", () => {
  assert.equal(nextWorksiteValue("", "將軍澳中心11座28樓A室", false), "將軍澳中心11座28樓A室");
  assert.equal(nextWorksiteValue("   ", "將軍澳中心11座28樓A室", false), "將軍澳中心11座28樓A室");
  assert.equal(nextWorksiteValue("九龍灣地盤", "將軍澳中心11座28樓A室", true), "九龍灣地盤");
  assert.equal(nextWorksiteValue("將軍澳中心11座28樓A室", "柏傲灣1B座39B", false), "柏傲灣1B座39B");
  assert.equal(nextWorksiteValue("九龍灣地盤", null, true), "九龍灣地盤");
  assert.equal(nextWorksiteValue("", null, false), "");
});

test("adding and deleting a rule changes classification", async () => {
  const base = records(rules);
  assert.equal(classifyTopicWithRules("請跟進水電", base), null);

  let called = false;
  const blank = await commitNewTopicRule("  ", "other", base, async () => {
    called = true;
    return { ok: false, error: "should not save" };
  });
  assert.equal(called, false);
  assert.deepEqual(blank, { ok: false, error: "請填寫字句。" });

  const added = await commitNewTopicRule("  跟進水電  ", "other", base, async (phrase, topic) => ({
    ok: true,
    rule: { id: "custom", phrase, topic: topic === "other" ? topic : "quote" },
  }));
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(classifyTopicWithRules("請跟進水電", added.rules), "other");
  assert.equal(classifyTopicWithRules(INVOICE, added.rules), "invoice");

  const removed = await commitDeleteTopicRule("custom", added.rules, async () => ({ ok: true }));
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(classifyTopicWithRules("請跟進水電", removed.rules), null);
  assert.equal(classifyTopicWithRules("買保險", removed.rules), "insurance");

  const insurance = removed.rules.filter((rule) => rule.topic === "insurance");
  const dropped = insurance.reduce((current, rule) => rulesAfterDelete(current, rule.id), removed.rules);
  assert.equal(classifyTopicWithRules("買保險", dropped), null);
  const restored = rulesAfterSave(dropped, { id: "again", phrase: "買保險", topic: "insurance" });
  assert.equal(classifyTopicWithRules("買保險", restored), "insurance");

  let removedCalled = false;
  const missing = await commitDeleteTopicRule("missing", base, async () => {
    removedCalled = true;
    return { ok: true };
  });
  assert.equal(removedCalled, false);
  assert.equal(missing.ok, false);
});

test("the new-request summary shows the breakdown and does not guess a topic", () => {
  const invoice = renderToStaticMarkup(
    createElement(CreateRequestInsights, {
      body: INVOICE,
      rules,
      topic: "invoice",
    }),
  );
  assert.match(invoice, /內容摘要/);
  assert.match(invoice, /添喜家居維修冷氣工程公司/);
  assert.match(invoice, /翁先生/);
  assert.match(invoice, /將軍澳中心11座28樓A室/);
  assert.match(invoice, /8呎冷氣棚/);
  assert.match(invoice, /保險加名/);
  assert.match(invoice, /已按內容選擇出發票。/);
  assert.doesNotMatch(invoice, /已按內容選擇買保險|僅供參考|事項未明確/);

  const quoted = renderToStaticMarkup(createElement(CreateRequestInsights, { body: QUOTE, rules, topic: "quote" }));
  assert.match(quoted, /內容摘要/);
  assert.match(quoted, /已按內容選擇出報價單。/);
  assert.match(quoted, /總數/);
  assert.match(quoted, /\$4680/);
  assert.match(quoted, /備註/);
  assert.doesNotMatch(quoted, /已按內容選擇買保險|已按內容選擇出發票/);

  const office = renderToStaticMarkup(
    createElement(CreateRequestInsights, { body: MANAGEMENT, rules, topic: "management" }),
  );
  assert.match(office, /已按內容選擇搵管理處。/);
  assert.equal("搵".codePointAt(0), 0x6435);
  assert.match(office, /管理處電話/);
  assert.match(office, /處理搭棚申請文件/);

  const fax = renderToStaticMarkup(createElement(CreateRequestInsights, { body: FAX, rules, topic: "management" }));
  assert.match(fax, /管理處傳真/);
  assert.match(fax, /23450631/);
  assert.doesNotMatch(fax, /tel:23450631/);

  const unclear = renderToStaticMarkup(createElement(CreateRequestInsights, { body: UNCLEAR, rules, topic: null }));
  assert.match(unclear, /內容摘要/);
  assert.match(unclear, /Sunny City Limited/);
  assert.match(unclear, /未能從內容判斷事項，請選擇事項。/);
  assert.doesNotMatch(unclear, /出報價單|僅供參考|已按內容選擇/);
  assert.equal(renderToStaticMarkup(createElement(CreateRequestInsights, { body: "   ", rules, topic: null })), "");
});

test("the admin can see and delete a rule from the list", () => {
  const html = renderToStaticMarkup(
    createElement(TopicRuleEditor, {
      rules: records([
        { phrase: "出單收錢", topic: "invoice" },
        { phrase: "已收錢", topic: "receipt" },
      ]),
      saveRule: async () => ({ ok: false as const, error: "unused" }),
      deleteRule: async () => ({ ok: true as const }),
    }),
  );
  assert.match(html, /字句/);
  assert.match(html, /出單收錢/);
  assert.match(html, /出發票/);
  assert.match(html, /已收錢/);
  assert.match(html, /出收據/);
  assert.match(html, /新增/);
  assert.match(html, /刪除規則「出單收錢」/);
  assert.match(html, /選擇事項/);
  assert.match(html, /<option[^>]*>出報價單<\/option>/);
  assert.match(html, /<option[^>]*>搵管理處<\/option>/);
});

test("only an admin can save or delete a topic rule, and clients receive phrases only", () => {
  const admin = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const create = readFileSync(new URL("../app/client/(portal)/new/page.tsx", import.meta.url), "utf8");
  const savedRequest = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const adminRequest = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const rulesPage = readFileSync(new URL("../app/admin/(desk)/topic-rules/page.tsx", import.meta.url), "utf8");

  const save = admin.slice(admin.indexOf("export async function saveTopicRule"), admin.indexOf("export async function deleteTopicRule"));
  const remove = admin.slice(admin.indexOf("export async function deleteTopicRule"), admin.indexOf("export async function prepareAdminReply"));
  assert.ok(save.indexOf("await requireAdmin()") > -1);
  assert.ok(save.indexOf("await requireAdmin()") < save.indexOf("insert into topic_rules"));
  assert.ok(remove.indexOf("await requireAdmin()") > -1);
  assert.ok(remove.indexOf("await requireAdmin()") < remove.indexOf("delete from topic_rules"));
  assert.match(remove, /isUuid\(id\)/);
  assert.doesNotMatch(save, /delete from requests|delete from clients/);
  assert.doesNotMatch(remove, /delete from requests|delete from clients/);
  assert.doesNotMatch(client, /saveTopicRule|deleteTopicRule|topic_rules/);

  const list = data.slice(data.indexOf("export async function listTopicRules"), data.indexOf("export async function countAdminUnread"));
  assert.ok(list.indexOf("readSession") > -1);
  assert.ok(list.indexOf("readSession") < list.indexOf("from topic_rules"));
  assert.match(list, /select id, phrase, topic/);
  assert.doesNotMatch(list, /password_hash|select \*/);

  const phrases = topicPhrasesForClient([{ id: "secret-id", phrase: "收錢", topic: "invoice" }]);
  assert.deepEqual(phrases, [{ phrase: "收錢", topic: "invoice" }]);
  assert.equal(JSON.stringify(phrases).includes("secret-id"), false);

  assert.match(create, /topicPhrasesForClient\(await listTopicRules\(\)\)/);
  assert.match(composer, /CreateRequestInsights/);
  assert.match(composer, /initialTopicSelection\(\)/);
  assert.match(composer, /onPaste=/);
  assert.match(composer, /nextWorksiteValue/);
  assert.match(composer, /topicSelectionAfterMatch/);
  assert.doesNotMatch(composer, /useState\(\s*"quote"\s*\)|saveTopicRule|deleteTopicRule/);
  assert.match(rulesPage, /事項規則/);
  assert.match(rulesPage, /saveRule=\{saveTopicRule\}/);
  assert.match(rulesPage, /deleteRule=\{deleteTopicRule\}/);
  assert.doesNotMatch(savedRequest, /classifyTopicWithRules|CreateRequestInsights|補充或回覆|saveTopicRule/);
  assert.doesNotMatch(adminRequest, /classifyTopicWithRules|saveTopicRule|deleteTopicRule|update requests set topic/i);
  assert.match(savedRequest, /<RequestBreakdown /);
  assert.match(adminRequest, /<RequestBreakdown /);
});
