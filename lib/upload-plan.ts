import {
  MAX_FILE_BYTES,
  mimeForExtension,
  parseStoragePath,
  type AllowedMime,
} from "@/lib/files";
import { isUuid } from "@/lib/tokens";

/**
 * Vercel Hobby request bodies are commonly limited to 4.5MB.
 * 4MiB leaves room for headers while a single file may still be 20MB.
 */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const PLATFORM_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);
export const MAX_UPLOAD_CHUNKS = Math.ceil(MAX_FILE_BYTES / UPLOAD_CHUNK_BYTES);

const STAGING_PREFIX =
  /^staging\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/;

export type UploadTicket = {
  path: string;
  contentType: AllowedMime;
  fileName: string;
  size: number;
  grant: string;
};

export type PlannedUpload = {
  path: string;
  size: number;
  contentType: AllowedMime;
  fileName: string;
};

export function uploadChunkCount(size: number): number {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) return 0;
  return Math.ceil(size / UPLOAD_CHUNK_BYTES);
}

export function uploadChunkRange(size: number, index: number): { start: number; end: number } | null {
  const count = uploadChunkCount(size);
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) return null;
  const start = index * UPLOAD_CHUNK_BYTES;
  return { start, end: Math.min(start + UPLOAD_CHUNK_BYTES, size) };
}

export function expectedPartLength(size: number, index: number): number | null {
  const range = uploadChunkRange(size, index);
  if (!range) return null;
  return range.end - range.start;
}

export function partBodyLengthOk(size: number, index: number, byteLength: number): boolean {
  const expected = expectedPartLength(size, index);
  return expected !== null && byteLength === expected && byteLength > 0 && byteLength <= UPLOAD_CHUNK_BYTES;
}

export function contentTypeForPath(path: string): AllowedMime | null {
  const parts = parseStoragePath(path);
  if (!parts) return null;
  return mimeForExtension(parts.extension);
}

export function stagingObjectKey(path: string, index: number): string | null {
  const parts = parseStoragePath(path);
  if (!parts) return null;
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_UPLOAD_CHUNKS) return null;
  return `staging/${parts.clientId}/${parts.requestId}/${parts.messageId}/${parts.attachmentId}.${parts.extension}/${index}`;
}

export function stagingPrefixForRequest(clientId: string, requestId: string): string | null {
  if (!isUuid(clientId) || !isUuid(requestId)) return null;
  return `staging/${clientId.toLowerCase()}/${requestId.toLowerCase()}/`;
}

export function isStagingPrefix(prefix: string): boolean {
  return STAGING_PREFIX.test(prefix);
}

export function assembleUpload(size: number, parts: readonly Uint8Array[]): Uint8Array | null {
  const count = uploadChunkCount(size);
  if (count === 0 || parts.length !== count) return null;
  const out = new Uint8Array(size);
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const part = parts[index];
    const expected = expectedPartLength(size, index);
    if (!part || expected === null || part.byteLength !== expected) return null;
    out.set(part, offset);
    offset += part.byteLength;
  }
  if (offset !== size) return null;
  return out;
}

export function uploadAllowed(input: {
  role: "admin" | "client";
  sessionClientId?: string;
  pathClientId: string;
  requestClientId: string;
}): boolean {
  if (!input.pathClientId || input.pathClientId !== input.requestClientId) return false;
  if (input.role === "admin") return true;
  return Boolean(input.sessionClientId) && input.sessionClientId === input.requestClientId;
}

export type SameOriginPart = {
  url: "/api/uploads";
  method: "POST";
  headers: Record<string, string>;
  start: number;
  end: number;
};

export type SameOriginComplete = {
  url: "/api/uploads";
  method: "POST";
  headers: Record<string, string>;
  body: { op: "complete"; path: string; grant: string };
};

function usableGrant(grant: string): boolean {
  return grant.length >= 40 && grant.length <= 4000 && grant.includes(".") && !grant.includes("\n");
}

export function sameOriginPartPlan(
  fileSize: number,
  ticket: { path: string; size: number; grant: string },
): SameOriginPart[] | null {
  if (fileSize !== ticket.size || !usableGrant(ticket.grant) || !parseStoragePath(ticket.path)) return null;
  const count = uploadChunkCount(fileSize);
  if (count === 0) return null;
  const parts: SameOriginPart[] = [];
  for (let index = 0; index < count; index += 1) {
    const range = uploadChunkRange(fileSize, index);
    if (!range || range.end <= range.start) return null;
    parts.push({
      url: "/api/uploads",
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-goodnote-path": ticket.path,
        "x-goodnote-index": String(index),
        "x-goodnote-grant": ticket.grant,
      },
      start: range.start,
      end: range.end,
    });
  }
  return parts;
}

export function sameOriginCompletePlan(ticket: { path: string; grant: string }): SameOriginComplete | null {
  if (!parseStoragePath(ticket.path) || !usableGrant(ticket.grant)) return null;
  return {
    url: "/api/uploads",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { op: "complete", path: ticket.path, grant: ticket.grant },
  };
}
