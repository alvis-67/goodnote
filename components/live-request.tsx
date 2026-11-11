"use client";

import { createContext, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useCacheScope, useReportFailure } from "@/components/view-cache-provider";
import { StatusBadge } from "@/components/status-badge";
import { isRedirectError, type MutationResult } from "@/lib/mutation";
import type { StatusId, TopicId } from "@/lib/domain";
import { nextRequestStage, requestTitle, stageAdvanceError, stageAdvancedNotice, type StageId } from "@/lib/request-stage";
import { beginOptimistic, browserViewStorage, settleOptimistic, type RequestProgress } from "@/lib/view-cache";

type LiveView = {
  topic: TopicId;
  stage: StageId;
  status: StatusId;
};

type LiveApi = {
  view: LiveView;
  pending: boolean;
  notice: string | null;
  error: string | null;
  companyName: string | null;
  commitStatus: (next: StatusId, run: () => Promise<MutationResult | void>) => Promise<void>;
  commitStage: (run: () => Promise<MutationResult | void>) => Promise<void>;
};

const LiveContext = createContext<LiveApi | null>(null);

export function useLiveRequest(): LiveApi | null {
  return useContext(LiveContext);
}

export function LiveRequest({
  requestId,
  topic,
  stage,
  status,
  companyName = null,
  children,
}: {
  requestId: string;
  topic: TopicId;
  stage: StageId;
  status: StatusId;
  companyName?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const scope = useCacheScope();
  const reportFailure = useReportFailure();
  const [view, setView] = useState<LiveView>({ topic, stage, status });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState<RequestProgress | null>(null);
  const busy = useRef(false);

  if (expected && expected.stage === stage && expected.status === status) {
    setExpected(null);
  } else if (!expected && (view.topic !== topic || view.stage !== stage || view.status !== status)) {
    setView({ topic, stage, status });
  }

  async function commit(previous: LiveView, next: LiveView, success: string, failure: string, run: () => Promise<MutationResult | void>) {
    if (busy.current) return;
    busy.current = true;
    setExpected({ status: next.status, stage: next.stage });
    setView(next);
    setPending(true);
    setNotice(null);
    setError(null);
    const storage = browserViewStorage();
    if (scope) beginOptimistic(storage, scope, requestId, previous, next);
    try {
      const result = await run();
      const settled = normalizeResult(result, failure);
      if (scope) settleOptimistic(storage, scope, requestId, settled);
      if (!settled.ok) {
        setExpected(null);
        setView(previous);
        setError(settled.error);
        reportFailure?.(settled.error);
        return;
      }
      setNotice(success);
      reportFailure?.(null);
      router.refresh();
    } catch (caught) {
      setExpected(null);
      setView(previous);
      if (scope) settleOptimistic(storage, scope, requestId, { ok: false, error: failure });
      if (isRedirectError(caught)) throw caught;
      setError(failure);
      reportFailure?.(failure);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const api: LiveApi = {
    view,
    pending,
    notice,
    error,
    companyName,
    commitStatus: (next, run) => {
      if (next === view.status) return Promise.resolve();
      return commit(view, { ...view, status: next }, "狀態已更新。", "狀態未能更新。", run);
    },
    commitStage: (run) => {
      const nextStage = nextRequestStage(view.topic, view.stage);
      if (!nextStage) return Promise.resolve();
      return commit(view, { ...view, stage: nextStage, status: "pending" }, stageAdvancedNotice(), stageAdvanceError(), run);
    },
  };

  return (
    <LiveContext.Provider value={api}>
      {pending ? (
        <p role="status" className="mb-3 text-sm font-semibold text-muted">
          正在更新…
        </p>
      ) : null}
      {error && !reportFailure ? (
        <p role="alert" className="mb-3 rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-3 rounded-2xl bg-ok-bg px-4 py-3 text-sm text-ok">
          {notice}
        </p>
      ) : null}
      {children}
    </LiveContext.Provider>
  );
}

export function LiveRequestTitle({
  topic,
  stage,
  className,
}: {
  topic: TopicId;
  stage: StageId;
  className?: string;
}) {
  const live = useLiveRequest();
  return <span className={className}>{requestTitle(live?.view.topic ?? topic, live?.view.stage ?? stage)}</span>;
}

export function LiveStatusBadge({ status }: { status: StatusId }) {
  const live = useLiveRequest();
  return <StatusBadge status={live?.view.status ?? status} />;
}

function normalizeResult(result: MutationResult | void, failure: string): MutationResult {
  if (result && typeof result === "object" && "ok" in result) return result;
  return { ok: false, error: failure };
}
