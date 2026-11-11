import { MAX_BODY_LENGTH } from "@/lib/files";

/** Built-in reply. It is always offered and is not stored as a custom preset. */
export const BUILTIN_REPLY_PRESET = "攪掂";
export const BUILTIN_REPLY_PRESET_ID = "builtin";
export const CREATE_REPLY_PRESET_ID = "create";

export type ReplyPresetRecord = {
  id: string;
  body: string;
};

export type SaveReplyPresetResult =
  | { ok: true; preset: ReplyPresetRecord | null; builtin: boolean }
  | { ok: false; error: string };

export type ReplyPresetOption = {
  id: string;
  label: string;
  body?: string;
};

export function replyPresetOptions(saved: readonly ReplyPresetRecord[]): ReplyPresetOption[] {
  const custom = saved.filter((item) => item.body.trim() && item.body !== BUILTIN_REPLY_PRESET);
  return [
    { id: BUILTIN_REPLY_PRESET_ID, label: BUILTIN_REPLY_PRESET, body: BUILTIN_REPLY_PRESET },
    ...custom.map((item) => ({
      id: item.id,
      label: item.body.replace(/\s+/g, " ").trim(),
      body: item.body,
    })),
    { id: CREATE_REPLY_PRESET_ID, label: "新增" },
  ];
}

export function applyReplyPresetChoice(
  choice: string,
  saved: readonly ReplyPresetRecord[],
): { type: "fill"; body: string } | { type: "create" } | { type: "ignore" } {
  if (choice === BUILTIN_REPLY_PRESET_ID) return { type: "fill", body: BUILTIN_REPLY_PRESET };
  if (choice === CREATE_REPLY_PRESET_ID) return { type: "create" };
  const preset = saved.find((item) => item.id === choice);
  if (!preset) return { type: "ignore" };
  if (preset.body === BUILTIN_REPLY_PRESET) return { type: "fill", body: BUILTIN_REPLY_PRESET };
  return { type: "fill", body: preset.body };
}

/** Choosing a preset replaces whatever is already in the reply field. */
export function replyBodyAfterPreset(current: string, presetBody: string): string {
  if (current === presetBody) return presetBody;
  return presetBody;
}

export function parseReplyPresetDraft(input: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = input.trim();
  if (!body) return { ok: false, error: "請填寫預設回覆。" };
  if (body.length > MAX_BODY_LENGTH) return { ok: false, error: "內容太長，請精簡至 4000 字以內。" };
  return { ok: true, body };
}

export function presetsAfterSave(
  current: readonly ReplyPresetRecord[],
  saved: ReplyPresetRecord | null,
): ReplyPresetRecord[] {
  const kept = current.filter((item) => item.body !== BUILTIN_REPLY_PRESET);
  if (!saved || saved.body === BUILTIN_REPLY_PRESET) return kept;
  if (kept.some((item) => item.id === saved.id || item.body === saved.body)) {
    return kept.map((item) => (item.id === saved.id || item.body === saved.body ? saved : item));
  }
  return [...kept, saved];
}

export async function commitNewReplyPreset(
  draft: string,
  current: readonly ReplyPresetRecord[],
  save: (body: string) => Promise<SaveReplyPresetResult>,
): Promise<{ ok: true; presets: ReplyPresetRecord[]; fill: string } | { ok: false; error: string }> {
  const parsed = parseReplyPresetDraft(draft);
  if (!parsed.ok) return parsed;
  if (parsed.body === BUILTIN_REPLY_PRESET) {
    return { ok: true, presets: presetsAfterSave(current, null), fill: BUILTIN_REPLY_PRESET };
  }
  const saved = await save(parsed.body);
  if (!saved.ok) return saved;
  if (saved.builtin || !saved.preset) {
    return { ok: true, presets: presetsAfterSave(current, null), fill: BUILTIN_REPLY_PRESET };
  }
  return {
    ok: true,
    presets: presetsAfterSave(current, saved.preset),
    fill: saved.preset.body,
  };
}
