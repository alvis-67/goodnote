import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReplyPresetPicker } from "../components/reply-preset-picker";
import {
  BUILTIN_REPLY_PRESET,
  applyReplyPresetChoice,
  commitNewReplyPreset,
  parseReplyPresetDraft,
  presetsAfterSave,
  replyBodyAfterPreset,
  replyPresetOptions,
  type ReplyPresetRecord,
  type SaveReplyPresetResult,
} from "./reply-presets";

const savedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const attachment: ReplyPresetRecord = { id: savedId, body: "請看附件" };

function optionLabels(html: string): string[] {
  return [...html.matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map((match) => match[1] ?? "");
}

test("the reply dropdown offers 攪掂, saved presets, and 新增", () => {
  const options = replyPresetOptions([
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", body: BUILTIN_REPLY_PRESET },
    attachment,
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", body: "稍後回覆" },
  ]);
  assert.deepEqual(
    options.map((option) => option.label),
    [BUILTIN_REPLY_PRESET, "請看附件", "稍後回覆", "新增"],
  );
  assert.equal(options.at(-1)?.id, "create");
  assert.equal(options[0]?.body, "攪掂");
  assert.equal("body" in (options.at(-1) ?? {}), false);

  const html = renderToStaticMarkup(
    createElement(ReplyPresetPicker, {
      presets: [attachment],
      body: "已寫了一句",
      onFill: () => undefined,
      savePreset: async (): Promise<SaveReplyPresetResult> => ({ ok: false, error: "unused" }),
    }),
  );
  assert.deepEqual(optionLabels(html), ["選擇預設", "攪掂", "請看附件", "新增"]);
  assert.match(html, /預設回覆/);
  assert.doesNotMatch(html, /新預設回覆/);
});

test("choosing a preset replaces the reply text", () => {
  assert.deepEqual(applyReplyPresetChoice("builtin", [attachment]), { type: "fill", body: "攪掂" });
  assert.deepEqual(applyReplyPresetChoice(savedId, [attachment]), { type: "fill", body: "請看附件" });
  assert.deepEqual(applyReplyPresetChoice("create", [attachment]), { type: "create" });
  assert.deepEqual(applyReplyPresetChoice("", [attachment]), { type: "ignore" });
  assert.equal(replyBodyAfterPreset("已寫了一句", "攪掂"), "攪掂");
  assert.equal(replyBodyAfterPreset("已寫了一句", "請看附件"), "請看附件");
  assert.notEqual(replyBodyAfterPreset("已寫了一句", "攪掂"), "已寫了一句");
  assert.equal(applyReplyPresetChoice("create", []).type === "fill", false);
});

test("saving a preset keeps it and fills the reply with that content", async () => {
  const calls: string[] = [];
  const save = async (body: string): Promise<SaveReplyPresetResult> => {
    calls.push(body);
    return { ok: true, preset: { id: savedId, body }, builtin: false };
  };
  const created = await commitNewReplyPreset("  請看附件  ", [], save);
  assert.deepEqual(calls, ["請看附件"]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.fill, "請看附件");
  assert.equal(replyBodyAfterPreset("舊回覆", created.fill), "請看附件");
  assert.deepEqual(created.presets, [attachment]);

  const again = await commitNewReplyPreset("請看附件", created.presets, async (body) => ({
    ok: true,
    preset: { id: savedId, body },
    builtin: false,
  }));
  assert.equal(again.ok, true);
  if (again.ok) assert.deepEqual(again.presets, [attachment]);
  assert.deepEqual(presetsAfterSave([attachment], attachment), [attachment]);
});

test("攪掂 is built in and is not stored again", async () => {
  let called = false;
  const result = await commitNewReplyPreset(`  ${BUILTIN_REPLY_PRESET}  `, [attachment], async () => {
    called = true;
    return { ok: false, error: "should not save" };
  });
  assert.equal(called, false);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fill, "攪掂");
  assert.deepEqual(result.presets, [attachment]);
  assert.equal(parseReplyPresetDraft("   ").ok, false);
  assert.equal(parseReplyPresetDraft("字".repeat(4001)).ok, false);
  assert.equal(parseReplyPresetDraft("  稍後回覆  ").ok && parseReplyPresetDraft("  稍後回覆  ").ok, true);
});
