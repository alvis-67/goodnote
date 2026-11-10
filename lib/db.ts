import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { databaseUrl } from "@/lib/env";

type Sql = NeonQueryFunction<false, false>;

let cached: Sql | undefined;

export function sql(): Sql {
  if (!cached) cached = neon(databaseUrl());
  return cached;
}

export function dbErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "";
}
