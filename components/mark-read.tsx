"use client";

import { useEffect } from "react";

import { markAdminRequestRead } from "@/lib/actions/admin";
import { markClientRequestRead } from "@/lib/actions/client";

export function MarkClientRead({ requestId }: { requestId: string }) {
  useEffect(() => {
    void markClientRequestRead(requestId);
  }, [requestId]);
  return null;
}

export function MarkAdminRead({ requestId }: { requestId: string }) {
  useEffect(() => {
    void markAdminRequestRead(requestId);
  }, [requestId]);
  return null;
}
