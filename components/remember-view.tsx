"use client";

import { useLayoutEffect } from "react";

import { useCacheScope } from "@/components/view-cache-provider";
import {
  browserViewStorage,
  rememberAdminDetail,
  rememberAdminList,
  rememberClientDetail,
  rememberClientList,
  type CachedAdminDetail,
  type CachedAdminRow,
  type CachedClientDetail,
  type CachedClientOption,
  type CachedClientRequest,
} from "@/lib/view-cache";

export function RememberClientList({ requests }: { requests: CachedClientRequest[] }) {
  const scope = useCacheScope();
  useLayoutEffect(() => {
    if (!scope) return;
    rememberClientList(browserViewStorage(), scope, requests);
  }, [scope, requests]);
  return null;
}

export function RememberClientDetail({ detail }: { detail: CachedClientDetail }) {
  const scope = useCacheScope();
  useLayoutEffect(() => {
    if (!scope) return;
    rememberClientDetail(browserViewStorage(), scope, detail);
  }, [scope, detail]);
  return null;
}

export function RememberAdminList({
  cacheKey,
  rows,
  clients,
}: {
  cacheKey: string;
  rows: CachedAdminRow[];
  clients: CachedClientOption[];
}) {
  const scope = useCacheScope();
  useLayoutEffect(() => {
    if (!scope) return;
    rememberAdminList(browserViewStorage(), scope, cacheKey, { rows, clients });
  }, [scope, cacheKey, rows, clients]);
  return null;
}

export function RememberAdminDetail({ detail }: { detail: CachedAdminDetail }) {
  const scope = useCacheScope();
  useLayoutEffect(() => {
    if (!scope) return;
    rememberAdminDetail(browserViewStorage(), scope, detail);
  }, [scope, detail]);
  return null;
}
