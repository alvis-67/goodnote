"use client";

import { useEffect } from "react";

import { markAdminRequestRead } from "@/lib/actions/admin";
import { markClientRequestRead } from "@/lib/actions/client";

export function MarkClientRead({ token, requestId }: { token: string; requestId: string }) {
  useEffect(() => {
    void markClientRequestRead(token, requestId);
  }, [token, requestId]);
  return null;
}

export function MarkAdminRead({ requestId }: { requestId: string }) {
  useEffect(() => {
    void markAdminRequestRead(requestId);
  }, [requestId]);
  return null;
}
