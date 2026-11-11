"use client";

import type { FormEvent } from "react";

import { useLiveRequest } from "@/components/live-request";
import { STATUSES, isStatusId, type StatusId } from "@/lib/domain";
import type { MutationResult } from "@/lib/mutation";

type StatusAction = (formData: FormData) => Promise<MutationResult | void> | MutationResult | void;

export function StatusMenu({
  requestId,
  status,
  action,
}: {
  requestId: string;
  status: StatusId;
  action: StatusAction;
}) {
  const live = useLiveRequest();
  const shown = live?.view.status ?? status;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next = String(formData.get("status") ?? "");
    if (!isStatusId(next) || !live) return;
    void live.commitStatus(next, () => Promise.resolve(action(formData)));
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-3" aria-busy={live?.pending || undefined}>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
        狀態
        <select
          name="status"
          value={shown}
          disabled={live?.pending}
          className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
          onChange={(event) => {
            event.currentTarget.form?.requestSubmit();
          }}
        >
          {STATUSES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={live?.pending} className="min-h-11 rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60">
        {live?.pending ? "正在更新…" : "更新狀態"}
      </button>
    </form>
  );
}
