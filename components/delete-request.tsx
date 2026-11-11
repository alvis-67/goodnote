"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { InstantLink } from "@/components/instant-link";
import { DELETE_CONFIRM_VALUE } from "@/lib/domain";

type DeleteAction = (formData: FormData) => Promise<void> | void;

export function DeleteRequest({
  requestId,
  confirming,
  action,
  cancelHref,
  askLabel = "刪除請求",
  compact = false,
}: {
  requestId: string;
  confirming: boolean;
  action: DeleteAction;
  cancelHref: string;
  askLabel?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(confirming);

  if (!open) {
    return (
      <button
        type="button"
        aria-label={askLabel}
        onClick={() => setOpen(true)}
        className={
          compact
            ? "text-sm font-semibold text-danger"
            : "inline-flex min-h-11 items-center justify-center rounded-xl border border-danger px-4 text-sm font-semibold text-danger"
        }
      >
        {compact ? "刪除" : "刪除請求"}
      </button>
    );
  }

  return (
    <form action={action} className="w-full rounded-2xl bg-danger-bg p-3 text-sm leading-6">
      <p>確定要刪除這則請求？相關訊息、附件和通知會一併移除，而且無法還原。</p>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="confirm" value={DELETE_CONFIRM_VALUE} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ConfirmDelete />
        {confirming ? (
          <InstantLink href={cancelHref} className="inline-flex min-h-11 items-center px-2 font-semibold text-navy">
            取消
          </InstantLink>
        ) : (
          <button type="button" className="inline-flex min-h-11 items-center px-2 font-semibold text-navy" onClick={() => setOpen(false)}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}

function ConfirmDelete() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-60">
      {pending ? "正在刪除…" : "確認刪除"}
    </button>
  );
}
