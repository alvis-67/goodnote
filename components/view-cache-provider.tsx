"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

import { adoptScope, browserViewRecord, browserViewStorage, takeMutationFailure, type CacheScope } from "@/lib/view-cache";

const ScopeContext = createContext<CacheScope | null>(null);
const FailureContext = createContext<((message: string | null) => void) | null>(null);

export function useCacheScope(): CacheScope | null {
  return useContext(ScopeContext);
}

export function useReportFailure(): ((message: string | null) => void) | null {
  return useContext(FailureContext);
}

const failureListeners = new Set<() => void>();
let failureVersion = 0;
let failureCache: { version: number; record: string; message: string | null } | null = null;

function subscribeFailure(listener: () => void) {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

function notifyFailure() {
  failureVersion += 1;
  failureCache = null;
  for (const listener of failureListeners) listener();
}

function readStoredFailure(): string | null {
  const record = browserViewRecord();
  if (failureCache && failureCache.version === failureVersion && failureCache.record === record) return failureCache.message;
  let message: string | null = null;
  try {
    const parsed = record ? (JSON.parse(record) as { failure?: unknown }) : null;
    message = parsed && typeof parsed.failure === "string" && parsed.failure.trim() ? parsed.failure : null;
  } catch {
    message = null;
  }
  failureCache = { version: failureVersion, record, message };
  return message;
}

export function ViewCacheProvider({
  role,
  accountId,
  children,
}: {
  role: CacheScope["role"];
  accountId: string;
  children: React.ReactNode;
}) {
  const scope = useMemo(() => ({ role, accountId }), [role, accountId]);
  const storedFailure = useSyncExternalStore(subscribeFailure, readStoredFailure, () => null);
  const [reported, setReported] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const failure = reported ?? (storedFailure && storedFailure !== dismissed ? storedFailure : null);
  const reportFailure = useCallback((message: string | null) => {
    if (!message) {
      takeMutationFailure(browserViewStorage());
      setReported(null);
      setDismissed(null);
      notifyFailure();
      return;
    }
    setReported(message);
    setDismissed(null);
  }, []);

  useLayoutEffect(() => {
    adoptScope(browserViewStorage(), scope);
    notifyFailure();
  }, [scope]);

  function dismiss() {
    takeMutationFailure(browserViewStorage());
    setReported(null);
    setDismissed(storedFailure);
    notifyFailure();
  }

  return (
    <ScopeContext.Provider value={scope}>
      <FailureContext.Provider value={reportFailure}>
        {failure ? (
          <p role="alert" className="mb-4 rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
            {failure}
            <button type="button" className="ml-3 font-semibold underline" onClick={dismiss}>
              關閉
            </button>
          </p>
        ) : null}
        {children}
      </FailureContext.Provider>
    </ScopeContext.Provider>
  );
}
