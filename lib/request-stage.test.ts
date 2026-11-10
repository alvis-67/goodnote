import assert from "node:assert/strict";
import test from "node:test";

import { topicLabel, type TopicId } from "./domain";
import {
  INVOICE_TITLE,
  OTHER_TITLE,
  QUOTE_TITLE,
  RECEIPT_STAGE_TITLE,
  adminStagePrompt,
  canAdvanceTo,
  nextRequestStage,
  requestTitle,
  stageAdvanceError,
  stageAdvanceLabel,
  stageAdvanceNote,
  stageAdvancedNotice,
  stageChangeText,
  type StageId,
} from "./request-stage";

const topics: TopicId[] = ["quote", "invoice", "receipt", "other"];
const stages: StageId[] = ["quote", "invoice", "receipt", "other"];

test("a quotation, its invoice, and its paid receipt use the agreed titles", () => {
  assert.equal(requestTitle("quote", "quote"), QUOTE_TITLE);
  assert.equal(requestTitle("quote", "quote"), "出報價單");
  assert.equal(requestTitle("quote", "invoice"), INVOICE_TITLE);
  assert.equal(requestTitle("quote", "invoice"), "出發票");
  assert.equal(requestTitle("invoice", "invoice"), INVOICE_TITLE);
  assert.equal(requestTitle("invoice", "invoice"), "出發票");
  assert.equal(requestTitle("quote", "receipt"), RECEIPT_STAGE_TITLE);
  assert.equal(requestTitle("quote", "receipt"), "已收錢，請出收據");
  assert.equal(requestTitle("invoice", "receipt"), "已收錢，請出收據");
  assert.equal(requestTitle("receipt", "receipt"), "已收錢，請出收據");
  assert.equal(requestTitle("other", "other"), OTHER_TITLE);
  assert.equal(requestTitle("other", "other"), "其他");
  assert.equal(topicLabel("quote"), "出報價單");
  assert.equal(topicLabel("invoice"), "出發票");
  assert.equal(topicLabel("receipt"), "出收據");
  assert.equal(topicLabel("other"), "其他");
});

test("stage moves one step forward and does not skip or go back", () => {
  assert.equal(nextRequestStage("quote", "quote"), "invoice");
  assert.equal(nextRequestStage("quote", "invoice"), "receipt");
  assert.equal(nextRequestStage("quote", "receipt"), null);
  assert.equal(nextRequestStage("invoice", "invoice"), "receipt");
  assert.equal(nextRequestStage("invoice", "receipt"), null);
  assert.equal(nextRequestStage("receipt", "receipt"), null);
  assert.equal(nextRequestStage("other", "other"), null);

  assert.equal(canAdvanceTo("quote", "quote", "invoice"), true);
  assert.equal(canAdvanceTo("quote", "invoice", "receipt"), true);
  assert.equal(canAdvanceTo("invoice", "invoice", "receipt"), true);
  assert.equal(canAdvanceTo("quote", "quote", "receipt"), false);
  assert.equal(canAdvanceTo("quote", "invoice", "quote"), false);
  assert.equal(canAdvanceTo("quote", "receipt", "invoice"), false);
  assert.equal(canAdvanceTo("invoice", "receipt", "invoice"), false);
  assert.equal(canAdvanceTo("receipt", "receipt", "invoice"), false);
  assert.equal(canAdvanceTo("other", "other", "invoice"), false);
  assert.equal(canAdvanceTo("invoice", "quote", "receipt"), false);

  for (const topic of topics) {
    for (const stage of stages) {
      const next = nextRequestStage(topic, stage);
      if (next) {
        assert.notEqual(next, stage);
        assert.equal(canAdvanceTo(topic, stage, next), true);
      }
    }
  }
});

test("the timeline and prompts use the same stage titles", () => {
  assert.equal(stageChangeText("quote", "quote", "invoice"), "階段由出報價單改為出發票");
  assert.equal(stageChangeText("quote", "invoice", "receipt"), "階段由出發票改為已收錢，請出收據");
  assert.equal(stageChangeText("invoice", "invoice", "receipt"), "階段由出發票改為已收錢，請出收據");
  assert.equal(stageAdvanceLabel("quote", "quote"), "出發票");
  assert.equal(stageAdvanceLabel("quote", "invoice"), "已收錢，請出收據");
  assert.equal(stageAdvanceLabel("invoice", "invoice"), "已收錢，請出收據");
  assert.equal(stageAdvanceLabel("quote", "receipt"), null);
  assert.equal(stageAdvanceLabel("invoice", "receipt"), null);
  assert.equal(stageAdvanceLabel("receipt", "receipt"), null);
  assert.equal(stageAdvanceLabel("other", "other"), null);
  assert.match(stageAdvanceNote(), /不會另開一則/);
  assert.match(stageAdvanceNote(), /待處理/);
  assert.match(stageAdvancedNotice(), /已進入下一階段/);
  assert.match(stageAdvancedNotice(), /待處理/);
  assert.match(stageAdvanceError(), /未能進入下一階段/);
  assert.equal(adminStagePrompt("甲工程公司", "quote", "quote"), "你可以為甲工程公司出報價單。");
  assert.equal(adminStagePrompt("甲工程公司", "quote", "invoice"), "你可以為甲工程公司出發票。");
  assert.equal(adminStagePrompt("甲工程公司", "invoice", "invoice"), "你可以為甲工程公司出發票。");
  assert.equal(adminStagePrompt("  ", "invoice", "invoice"), "你可以為這位客人出發票。");
  assert.equal(adminStagePrompt("甲工程公司", "quote", "receipt"), "你可以為甲工程公司出收據。");
  assert.equal(adminStagePrompt("甲工程公司", "invoice", "receipt"), "你可以為甲工程公司出收據。");
  assert.equal(adminStagePrompt("甲工程公司", "receipt", "receipt"), "你可以為甲工程公司出收據。");
  assert.equal(adminStagePrompt("甲工程公司", "other", "other"), null);
  assert.equal(adminStagePrompt("甲工程公司", "invoice", "quote"), null);

  for (const stage of ["quote", "invoice"] as const) {
    const prompt = adminStagePrompt("甲工程公司", "quote", stage) ?? "";
    assert.doesNotMatch(prompt, /已收錢/);
    assert.doesNotMatch(prompt, /出收據/);
  }
  const receiptPrompt = adminStagePrompt("甲工程公司", "quote", "receipt") ?? "";
  assert.match(receiptPrompt, /出收據/);
  assert.doesNotMatch(receiptPrompt, /出發票/);
});
