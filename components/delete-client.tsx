import type { ComponentProps } from "react";

import { clientDeleteConsequence } from "@/lib/client-delete";
import { DELETE_CONFIRM_VALUE } from "@/lib/domain";

type FormAction = Exclude<NonNullable<ComponentProps<"form">["action"]>, string>;

export function DeleteClient({
  clientId,
  companyName,
  confirming,
  action,
  askHref,
  cancelHref,
}: {
  clientId: string;
  companyName: string;
  confirming: boolean;
  action: FormAction;
  askHref: string;
  cancelHref: string;
}) {
  const askLabel = `刪除${companyName}`;
  if (!confirming) {
    return (
      <a
        href={askHref}
        aria-label={askLabel}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-danger px-4 text-sm font-semibold text-danger"
      >
        刪除客戶
      </a>
    );
  }

  return (
    <form action={action} className="w-full rounded-2xl bg-danger-bg p-3 text-sm leading-6">
      <p>
        確定要刪除「{companyName}」？{clientDeleteConsequence}
      </p>
      <input type="hidden" name="clientId" value={clientId} />
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
