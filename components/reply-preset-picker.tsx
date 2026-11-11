"use client";

import { useState } from "react";

import {
  CREATE_REPLY_PRESET_ID,
  applyReplyPresetChoice,
  commitNewReplyPreset,
  replyBodyAfterPreset,
  replyPresetOptions,
  type ReplyPresetRecord,
  type SaveReplyPresetResult,
} from "@/lib/reply-presets";

export function ReplyPresetPicker({
  presets,
  body,
  onFill,
  savePreset,
}: {
  presets: readonly ReplyPresetRecord[];
  body: string;
  onFill: (body: string) => void;
  savePreset: (body: string) => Promise<SaveReplyPresetResult>;
}) {
  const [saved, setSaved] = useState<ReplyPresetRecord[]>(() => presets.filter((item) => item.body.trim()));
  const [choice, setChoice] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const options = replyPresetOptions(saved);

  function onSelect(value: string) {
    const effect = applyReplyPresetChoice(value, saved);
    if (effect.type === "fill") {
      onFill(replyBodyAfterPreset(body, effect.body));
      setChoice("");
      setError(null);
      return;
    }
    setChoice(effect.type === "create" ? CREATE_REPLY_PRESET_ID : "");
    setError(null);
  }

  async function onSave() {
    setPending(true);
    setError(null);
    const result = await commitNewReplyPreset(draft, saved, savePreset);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.presets);
    onFill(replyBodyAfterPreset(body, result.fill));
    setDraft("");
    setChoice("");
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm font-semibold">
        預設回覆
        <select
          value={choice}
          onChange={(event) => onSelect(event.target.value)}
          className="rounded-2xl border border-line bg-white px-3 py-3 font-normal"
        >
          <option value="">選擇預設</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {choice === CREATE_REPLY_PRESET_ID ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            新預設回覆
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={4000}
              className="rounded-2xl border border-line bg-white px-3 py-3 font-normal leading-7"
            />
          </label>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={pending}
            className="min-h-11 self-start rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? "正在儲存…" : "儲存"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
