import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReplyPresetDelete, ReplyPresetPicker } from "../components/reply-preset-picker";
import {
  BUILTIN_REPLY_PRESET,
  BUILTIN_REPLY_PRESET_ID,
  applyReplyPresetChoice,
  commitDeleteReplyPreset,
  commitNewReplyPreset,
  parseReplyPresetDraft,
  presetsAfterDelete,
  presetsAfterSave,
  replyBodyAfterPreset,
  replyPresetDeleteName,
  replyPresetOptions,
  type DeleteReplyPresetResult,
  type ReplyPresetRecord,
  type SaveReplyPresetResult,
} from "./reply-presets";

const savedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const attachment: ReplyPresetRecord = { id: savedId, body: "請看附件" };
const later: ReplyPresetRecord = { id: otherId, body: "稍後回覆" };

function unusedDelete(): Promise<DeleteReplyPresetResult> {
  return Promise.resolve({ ok: false, error: "unused" });
}

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
      deletePreset: unusedDelete,
    }),
  );
  assert.deepEqual(optionLabels(html), ["選擇預設", "攪掂", "請看附件", "新增"]);
  assert.match(html, /預設回覆/);
  assert.match(html, /已儲存的預設/);
  assert.match(html, /aria-label="刪除預設「請看附件」"/);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /刪除預設「攪掂」/);
  assert.doesNotMatch(html, /確認刪除/);
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /新預設回覆/);

  const builtinOnly = renderToStaticMarkup(
    createElement(ReplyPresetPicker, {
      presets: [{ id: otherId, body: BUILTIN_REPLY_PRESET }],
      body: "",
      onFill: () => undefined,
      savePreset: async (): Promise<SaveReplyPresetResult> => ({ ok: false, error: "unused" }),
      deletePreset: unusedDelete,
    }),
  );
  assert.deepEqual(optionLabels(builtinOnly), ["選擇預設", "攪掂", "新增"]);
  assert.doesNotMatch(builtinOnly, /刪除/);
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

test("deleting a saved preset removes it after confirmation, and 攪掂 cannot be deleted", async () => {
  assert.deepEqual([...BUILTIN_REPLY_PRESET].map((char) => char.codePointAt(0)), [0x652a, 0x6382]);
  assert.equal(replyPresetDeleteName("請看\n附件"), "請看 附件");
  assert.equal(replyPresetDeleteName("字".repeat(80)).length, 80);
  assert.equal(replyPresetDeleteName("字".repeat(81)), `${"字".repeat(80)}…`);

  const idle = renderToStaticMarkup(
    createElement(ReplyPresetDelete, {
      label: "請看附件",
      confirming: false,
      pending: false,
      deleting: false,
      error: null,
      onAsk: () => undefined,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );
  assert.match(idle, /type="button"/);
  assert.match(idle, /刪除預設「請看附件」/);
  assert.doesNotMatch(idle, /確認刪除/);
  assert.doesNotMatch(idle, /<form/);

  const confirming = renderToStaticMarkup(
    createElement(ReplyPresetDelete, {
      label: "請看附件",
      confirming: true,
      pending: false,
      deleting: false,
      error: null,
      onAsk: () => undefined,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );
  assert.match(confirming, /確定要刪除「請看附件」/);
  assert.match(confirming, /所有管理員都不會再見到這個預設回覆/);
  assert.match(confirming, /無法還原/);
  assert.match(confirming, /確認刪除/);
  assert.match(confirming, /取消/);
  assert.match(confirming, /type="button"/);
  assert.doesNotMatch(confirming, /type="submit"/);
  assert.doesNotMatch(confirming, /<form/);

  const calls: string[] = [];
  const removed = await commitDeleteReplyPreset(savedId, [attachment, later], async (id) => {
    calls.push(id);
    return { ok: true };
  });
  assert.deepEqual(calls, [savedId]);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.deepEqual(removed.presets, [later]);
  assert.deepEqual(
    replyPresetOptions(removed.presets).map((option) => option.label),
    [BUILTIN_REPLY_PRESET, "稍後回覆", "新增"],
  );
  assert.deepEqual(presetsAfterDelete([attachment, later], savedId), [later]);

  let called = false;
  const builtin = await commitDeleteReplyPreset(BUILTIN_REPLY_PRESET_ID, [attachment], async () => {
    called = true;
    return { ok: true };
  });
  assert.equal(called, false);
  assert.deepEqual(builtin, { ok: false, error: "這個預設回覆不能刪除。" });

  const storedBuiltin = await commitDeleteReplyPreset(savedId, [{ id: savedId, body: BUILTIN_REPLY_PRESET }], async () => {
    called = true;
    return { ok: true };
  });
  assert.equal(called, false);
  assert.equal(storedBuiltin.ok, false);
  assert.deepEqual(
    presetsAfterDelete([attachment, { id: otherId, body: BUILTIN_REPLY_PRESET }], "builtin"),
    [attachment],
  );

  const failed = await commitDeleteReplyPreset(savedId, [attachment, later], async () => ({
    ok: false,
    error: "未能刪除預設回覆。",
  }));
  assert.deepEqual(failed, { ok: false, error: "未能刪除預設回覆。" });
  assert.deepEqual(presetsAfterDelete([attachment, later], "missing"), [attachment, later]);
});

test("only an admin action can delete a saved reply preset", () => {
  const admin = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../components/reply-preset-picker.tsx", import.meta.url), "utf8");
  const action = admin.slice(
    admin.indexOf("export async function deleteReplyPreset"),
    admin.indexOf("export async function prepareAdminReply"),
  );

  const adminAt = action.indexOf("await requireAdmin()");
  const deleteAt = action.indexOf("delete from reply_presets");
  assert.ok(adminAt > -1, "deleteReplyPreset requires an admin");
  assert.ok(deleteAt > adminAt, "the row is deleted only after the admin session");
  assert.match(action, /isUuid\(id\)/);
  assert.ok(action.indexOf("isUuid(id)") > adminAt);
  assert.ok(action.indexOf("isUuid(id)") < deleteAt);
  assert.match(action, /body <> \$\{BUILTIN_REPLY_PRESET\}/);
  assert.match(action, /未能刪除預設回覆。/);
  assert.doesNotMatch(action, /delete from clients|delete from requests/);

  assert.match(composer, /deletePreset=\{deleteReplyPreset\}/);
  assert.match(picker, /確認刪除/);
  assert.match(picker, /type="button"/);
  assert.doesNotMatch(client, /deleteReplyPreset|delete\s+from\s+reply_presets/i);
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
