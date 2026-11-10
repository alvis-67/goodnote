import type { ComponentProps } from "react";

type FormAction = Exclude<NonNullable<ComponentProps<"form">["action"]>, string>;

export function AdvanceStage({
  requestId,
  label,
  note,
  prompt,
  action,
}: {
  requestId: string;
  label: string;
  note: string;
  prompt?: string | null;
  action: FormAction;
}) {
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="requestId" value={requestId} />
      {prompt ? <p className="font-semibold">{prompt}</p> : null}
      <p className={`text-sm leading-6 text-muted ${prompt ? "mt-1" : ""}`}>{note}</p>
      <button
        type="submit"
        className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-stamp px-4 py-2 text-sm font-semibold text-white"
      >
        {label}
      </button>
    </form>
  );
}
