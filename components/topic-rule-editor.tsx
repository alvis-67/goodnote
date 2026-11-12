"use client";

import { useId, useState } from "react";

import { TOPICS, topicLabel } from "@/lib/domain";
import {
  MAX_TOPIC_RULE_PHRASE_LENGTH,
  commitDeleteTopicRule,
  commitNewTopicRule,
  type DeleteTopicRuleResult,
  type SaveTopicRuleResult,
  type TopicRuleRecord,
} from "@/lib/topic-rules";

export function TopicRuleEditor({
  rules,
  saveRule,
  deleteRule,
}: {
  rules: readonly TopicRuleRecord[];
  saveRule: (phrase: string, topic: string) => Promise<SaveTopicRuleResult>;
  deleteRule: (id: string) => Promise<DeleteTopicRuleResult>;
}) {
  const listId = useId();
  const [saved, setSaved] = useState<TopicRuleRecord[]>(() => rules.filter((rule) => rule.phrase.trim()));
  const [phrase, setPhrase] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;

  async function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await commitNewTopicRule(phrase, topic, saved, saveRule);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.rules);
    setPhrase("");
    setTopic("");
    setConfirmingId(null);
  }

  async function onDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    const result = await commitDeleteTopicRule(id, saved, deleteRule);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setSaved(result.rules);
    setConfirmingId(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={(event) => void onAdd(event)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          字句
          <input
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            type="text"
            name="phrase"
            maxLength={MAX_TOPIC_RULE_PHRASE_LENGTH}
            autoComplete="off"
            placeholder="例如：出單收錢"
            className="rounded-2xl border border-line bg-white px-3 py-3 font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          事項
          <select
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            name="topic"
            className="rounded-2xl border border-line bg-white px-3 py-3 font-normal"
          >
            <option value="">選擇事項</option>
            {TOPICS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 self-start rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "正在新增…" : "新增"}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>

      <div className="flex flex-col gap-2">
        <p id={listId} className="text-sm font-semibold">
          已有規則
        </p>
        {saved.length === 0 ? (
          <p className="text-sm leading-6 text-muted">尚未有規則。新請求不會自動選擇事項。</p>
        ) : (
          <ul aria-labelledby={listId} className="flex flex-col gap-2">
            {saved.map((rule) => {
              const label = topicLabel(rule.topic);
              const confirming = confirmingId === rule.id;
              return (
                <li key={rule.id}>
                  {confirming ? (
                    <div className="rounded-2xl bg-danger-bg p-3 text-sm leading-6">
                      <p>
                        確定要刪除「{rule.phrase}」？之後新請求不會再因這句字自動選擇{label}，而且無法還原。
                      </p>
                      {deleteError ? (
                        <p role="alert" className="mt-2 text-danger">
                          {deleteError}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void onDelete(rule.id)}
                          disabled={busy}
                          className="min-h-11 rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-60"
                        >
                          {deleting ? "正在刪除…" : "確認刪除"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (deleting) return;
                            setConfirmingId(null);
                            setDeleteError(null);
                          }}
                          disabled={busy}
                          className="inline-flex min-h-11 items-center px-2 font-semibold text-navy disabled:opacity-60"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2">
                      <span className="min-w-0 flex-1 text-sm font-normal">
                        <span className="font-semibold">{rule.phrase}</span>
                        <span className="mt-0.5 block text-muted">{label}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`刪除規則「${rule.phrase}」`}
                        onClick={() => {
                          setConfirmingId(rule.id);
                          setDeleteError(null);
                        }}
                        disabled={busy}
                        className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-danger disabled:opacity-60"
                      >
                        刪除
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
