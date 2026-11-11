"use client";

import type { FormEvent } from "react";

import { useLiveRequest } from "@/components/live-request";
import type { MutationResult } from "@/lib/mutation";
import { adminStagePrompt, stageAdvanceLabel } from "@/lib/request-stage";

type StageAction = (formData: FormData) => Promise<MutationResult | void> | MutationResult | void;

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
  action: StageAction;
}) {
  const live = useLiveRequest();
  const topic = live?.view.topic;
  const stage = live?.view.stage;
  const shownLabel = topic && stage ? stageAdvanceLabel(topic, stage) : label;
  const shownPrompt =
    live?.companyName && topic && stage ? adminStagePrompt(live.companyName, topic, stage) : prompt;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!live) return;
    const formData = new FormData(event.currentTarget);
    void live.commitStage(() => Promise.resolve(action(formData)));
  }

  if (!shownLabel) return <StagePrompt prompt={shownPrompt} />;

  return (
    <form onSubmit={onSubmit} className="mt-3">
      <input type="hidden" name="requestId" value={requestId} />
      {shownPrompt ? <p className="font-semibold">{shownPrompt}</p> : null}
      <p className={`text-sm leading-6 text-muted ${shownPrompt ? "mt-1" : ""}`}>{note}</p>
      <button
        type="submit"
        disabled={live?.pending}
        className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-stamp px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {live?.pending ? "正在更新…" : shownLabel}
      </button>
    </form>
  );
}

export function StagePrompt({ prompt }: { prompt?: string | null }) {
  if (!prompt) return null;
  return <p className="mt-3 font-semibold">{prompt}</p>;
}
