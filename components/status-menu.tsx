"use client";

import type { ComponentProps } from "react";

import { STATUSES, type StatusId } from "@/lib/domain";

type FormAction = Exclude<NonNullable<ComponentProps<"form">["action"]>, string>;

export function StatusMenu({
  requestId,
  status,
  action,
}: {
  requestId: string;
  status: StatusId;
  action: FormAction;
}) {
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
        狀態
        <select
          name="status"
          defaultValue={status}
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
      <button type="submit" className="min-h-11 rounded-xl bg-navy px-4 text-sm font-semibold text-white">
        更新狀態
      </button>
    </form>
  );
}
