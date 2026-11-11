"use client";

import { useId, useState } from "react";

import {
  CREATE_REPLY_PRESET_ID,
  applyReplyPresetChoice,
  commitDeleteReplyPreset,
  commitNewReplyPreset,
  deletableReplyPresets,
  replyBodyAfterPreset,
  replyPresetDeleteName,
  replyPresetLabel,
  replyPresetOptions,
  type DeleteReplyPresetResult,
  type ReplyPresetRecord,
  type SaveReplyPresetResult,
} from "@/lib/reply-presets";

export function ReplyPresetPicker({
  presets,
  body,
  onFill,
  savePreset,
  deletePreset,
}: {
  presets: readonly ReplyPresetRecord[];
  body: string;
  onFill: (body: string) => void;
  savePreset: (body: string) => Promise<SaveReplyPresetResult>;
  deletePreset: (id: string) => Promise<DeleteReplyPresetResult>;
}) {
  const deleteHeadingId = useId();
  const [saved, setSaved] = useState<ReplyPresetRecord[]>(() => presets.filter((item) => item.body.trim()));
  const [choice, setChoice] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const options = replyPresetOptions(saved);
  const deletable = deletableReplyPresets(saved);
  const busy = saving || deleting;

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
    setSaving(true);
    setError(null);
    const result = await commitNewReplyPreset(draft, saved, savePreset);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.presets);
    onFill(replyBodyAfterPreset(body, result.fill));
    setDraft("");
    setChoice("");
  }

  async function onDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    const result = await commitDeleteReplyPreset(id, saved, deletePreset);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setSaved(result.presets);
    setConfirmingId(null);
    setDeleteError(null);
    if (choice === id) setChoice("");
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
      {deletable.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p id={deleteHeadingId} className="text-sm font-semibold">
            已儲存的預設
          </p>
          <ul aria-labelledby={deleteHeadingId} className="flex flex-col gap-2">
            {deletable.map((preset) => {
              const label = replyPresetLabel(preset.body);
              const confirming = confirmingId === preset.id;
              return (
                <li key={preset.id}>
                  {confirming ? (
                    <ReplyPresetDelete
                      label={label}
                      confirming
                      pending={busy}
                      deleting={deleting}
                      error={deleteError}
                      onAsk={() => undefined}
                      onCancel={() => {
                        if (deleting) return;
                        setConfirmingId(null);
                        setDeleteError(null);
                      }}
                      onConfirm={() => void onDelete(preset.id)}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-normal" title={label}>
                        {label}
                      </span>
                      <ReplyPresetDelete
                        label={label}
                        confirming={false}
                        pending={busy}
                        deleting={false}
                        error={null}
                        onAsk={() => {
                          setConfirmingId(preset.id);
                          setDeleteError(null);
                        }}
                        onCancel={() => undefined}
                        onConfirm={() => undefined}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
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
            disabled={busy || confirmingId !== null}
            className="min-h-11 self-start rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "正在儲存…" : "儲存"}
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

export function ReplyPresetDelete({
  label,
  confirming,
  pending,
  deleting = false,
  error,
  onAsk,
  onCancel,
  onConfirm,
}: {
  label: string;
  confirming: boolean;
  pending: boolean;
  deleting?: boolean;
  error: string | null;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = replyPresetDeleteName(label);
  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={`刪除預設「${name}」`}
        onClick={onAsk}
        disabled={pending}
        className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-danger disabled:opacity-60"
      >
        刪除
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-danger-bg p-3 text-sm leading-6">
      <p>確定要刪除「{name}」？所有管理員都不會再見到這個預設回覆，而且無法還原。</p>
      {error ? (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="min-h-11 rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-60"
        >
          {deleting ? "正在刪除…" : "確認刪除"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex min-h-11 items-center px-2 font-semibold text-navy disabled:opacity-60"
        >
          取消
        </button>
      </div>
    </div>
  );
}
