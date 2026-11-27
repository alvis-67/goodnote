"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { MutationResult } from "@/lib/mutation";

export type UpdateRequestContent = (input: { requestId: string; body: string }) => Promise<MutationResult>;

export function EditRequestContentForm({
  requestId,
  content,
  action,
  initiallyEditing = false,
  onSaved,
}: {
  requestId: string;
  content: string;
  action: UpdateRequestContent;
  initiallyEditing?: boolean;
  onSaved?: () => void;
}) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = `request-content-${requestId}`;
  const [source, setSource] = useState(content);
  const [saved, setSaved] = useState(content);
  const [draft, setDraft] = useState(content);
  const [editing, setEditing] = useState(initiallyEditing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (content !== source) {
    setSource(content);
    if (!editing) {
      setSaved(content);
      setDraft(content);
    }
  }

  useEffect(() => {
    if (!editing) return;
    fieldRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
    errorRef.current?.scrollIntoView({ block: "center" });
  }, [error]);

  function startEditing() {
    setDraft(saved);
    setError(null);
    setNotice(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(saved);
    setError(null);
    setEditing(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await action({ requestId, body: draft });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = draft.trim();
    setSaved(next);
    setDraft(next);
    setEditing(false);
    setNotice("內容已更新。");
    onSaved?.();
  }

  return (
    <section aria-label="內容" className="mt-5 rounded-3xl border border-line bg-card p-4">
      <h2 className="text-base font-semibold">內容</h2>
      {editing ? (
        <form onSubmit={onSubmit} aria-busy={pending || undefined} className="mt-3 flex flex-col gap-3">
          <label htmlFor={fieldId} className="sr-only">
            內容
          </label>
          <textarea
            ref={fieldRef}
            id={fieldId}
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={8}
            maxLength={4000}
            disabled={pending}
            className="rounded-2xl border border-line bg-white px-3 py-3 font-normal leading-7"
          />
          <p className="text-sm leading-6 text-muted">只會儲存這段內容。事項、工作地點、檔案、狀態和階段維持不變。</p>
          {error ? (
            <p
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="rounded-xl bg-danger-bg px-3 py-3 text-base leading-7 text-danger outline-none"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 w-full rounded-2xl bg-stamp px-4 font-semibold text-white disabled:opacity-60"
          >
            {pending ? "正在儲存…" : "儲存"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={pending}
            className="min-h-12 w-full rounded-2xl border border-line bg-white px-4 font-semibold disabled:opacity-60"
          >
            取消
          </button>
        </form>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-wrap text-base leading-7">
            {saved.trim() ? saved : <span className="text-muted">尚未填寫內容。</span>}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">可以隨時修改內容。事項、工作地點、檔案、狀態和階段不會改變。</p>
          {notice ? (
            <p role="status" className="mt-3 text-sm font-semibold text-ok">
              {notice}
            </p>
          ) : null}
          <button
            type="button"
            onClick={startEditing}
            className="mt-3 min-h-12 w-full rounded-2xl bg-stamp px-4 font-semibold text-white"
          >
            修改內容
          </button>
        </>
      )}
    </section>
  );
}

export function EditRequestContent(props: {
  requestId: string;
  content: string;
  action: UpdateRequestContent;
}) {
  const router = useRouter();
  return <EditRequestContentForm {...props} onSaved={() => router.refresh()} />;
}
