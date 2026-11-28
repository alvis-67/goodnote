"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DELETE_CONFIRM_VALUE } from "@/lib/domain";
import type { MutationResult } from "@/lib/mutation";

export type DeleteConversationMessageAction = (input: {
  requestId: string;
  messageId: string;
  confirm: string;
}) => Promise<MutationResult>;

export function DeleteConversationMessageForm({
  requestId,
  messageId,
  action,
  mine,
  confirming = false,
  onDeleted,
}: {
  requestId: string;
  messageId: string;
  action: DeleteConversationMessageAction;
  mine: boolean;
  confirming?: boolean;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(confirming);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await action({ requestId, messageId, confirm: DELETE_CONFIRM_VALUE });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDeleted?.();
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="刪除這則訊息"
        onClick={() => setOpen(true)}
        className={
          mine
            ? "mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-white underline decoration-white/40"
            : "mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-danger"
        }
      >
        刪除
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-danger-bg p-3 text-sm leading-6 text-ink">
      <p>確定要刪除這則訊息？這則訊息和附件會一併移除，而且無法還原。</p>
      {error ? (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={confirmDelete}
          disabled={pending}
          className="min-h-11 rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "正在刪除…" : "確認刪除"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(false);
          }}
          disabled={pending}
          className="inline-flex min-h-11 items-center px-2 font-semibold text-navy disabled:opacity-60"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export function DeleteConversationMessage(
  props: Omit<Parameters<typeof DeleteConversationMessageForm>[0], "onDeleted" | "confirming">,
) {
  const router = useRouter();
  return <DeleteConversationMessageForm {...props} onDeleted={() => router.refresh()} />;
}
