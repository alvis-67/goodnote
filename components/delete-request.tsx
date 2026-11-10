import type { ComponentProps } from "react";

import { DELETE_CONFIRM_VALUE } from "@/lib/domain";

type FormAction = Exclude<NonNullable<ComponentProps<"form">["action"]>, string>;

export function DeleteRequest({
  requestId,
  confirming,
  action,
  askHref,
  cancelHref,
  askLabel = "刪除請求",
  compact = false,
}: {
  requestId: string;
  confirming: boolean;
  action: FormAction;
  askHref: string;
  cancelHref: string;
  askLabel?: string;
  compact?: boolean;
}) {
  if (!confirming) {
    return (
      <a
        href={askHref}
        aria-label={askLabel}
        className={
          compact
            ? "text-sm font-semibold text-danger"
            : "inline-flex min-h-11 items-center justify-center rounded-xl border border-danger px-4 text-sm font-semibold text-danger"
        }
      >
        {compact ? "刪除" : "刪除請求"}
      </a>
    );
  }

  return (
    <form action={action} className="w-full rounded-2xl bg-danger-bg p-3 text-sm leading-6">
      <p>確定要刪除這則請求？相關訊息、附件和通知會一併移除，而且無法還原。</p>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="confirm" value={DELETE_CONFIRM_VALUE} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className="min-h-11 rounded-xl bg-danger px-4 font-semibold text-white">
          確認刪除
        </button>
        <a href={cancelHref} className="inline-flex min-h-11 items-center px-2 font-semibold text-navy">
          取消
        </a>
      </div>
    </form>
  );
}
