import {
  displayFileName,
  isAllowedMime,
  MAX_FILE_BYTES,
  mimeForExtension,
  parseStoragePath,
  type AllowedMime,
} from "@/lib/files";
import { isUuid } from "@/lib/tokens";
import {
  PLATFORM_BODY_LIMIT_BYTES,
  UPLOAD_CHUNK_BYTES,
  uploadAllowed,
  uploadChunkCount,
  uploadChunkRange,
} from "@/lib/upload-plan";

/**
 * A download response uses the same 4MiB ceiling as an upload part.
 * That stays under the common 4.5MB platform body limit while a file may be 20MB.
 */
export { PLATFORM_BODY_LIMIT_BYTES, UPLOAD_CHUNK_BYTES };

const PREVIEWABLE = new Set<string>(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type DownloadActor = { role: "admin" | "client"; clientId?: string } | null;

export type StoredAttachment = {
  id: string;
  messageId: string;
  requestId: string;
  storagePath: string;
  requestClientId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type DownloadAccess =
  | { ok: true; path: string; fileName: string; mime: AllowedMime; size: number }
  | { ok: false; status: 401 | 404; error: string };

export function canPreviewInline(mime: string): boolean {
  return PREVIEWABLE.has(mime);
}

export function opensInBrowser(mime: string): boolean {
  return canPreviewInline(mime) || mime === "application/pdf" || mime === "text/plain";
}

export function attachmentFilePath(id: string): string | null {
  if (!isUuid(id)) return null;
  return `/api/files/${id.toLowerCase()}`;
}

export function attachmentPartPath(id: string, index: number): string | null {
  const base = attachmentFilePath(id);
  if (!base || !Number.isSafeInteger(index) || index < 0 || index > 999) return null;
  return `${base}?part=${index}`;
}

export function contentDisposition(mime: AllowedMime, fileName: string): string {
  const cleaned = displayFileName(fileName).replace(/["\\]/g, "");
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_") || "file";
  const encoded = encodeURIComponent(cleaned);
  const kind = opensInBrowser(mime) ? "inline" : "attachment";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function readDownloadPart(
  part: string | null,
  size: number,
): { ok: true; start: number; end: number } | { ok: false; status: number; error: string } {
  const count = uploadChunkCount(size);
  if (count === 0) return { ok: false, status: 404, error: "找不到檔案。" };
  if (part === null || part === "") {
    if (size > UPLOAD_CHUNK_BYTES) return { ok: false, status: 400, error: "請分段下載檔案。" };
    return { ok: true, start: 0, end: size };
  }
  if (!/^(0|[1-9]\d{0,2})$/.test(part)) return { ok: false, status: 400, error: "未能開啟檔案。" };
  const range = uploadChunkRange(size, Number(part));
  if (!range) return { ok: false, status: 400, error: "未能開啟檔案。" };
  const length = range.end - range.start;
  if (length <= 0 || length > UPLOAD_CHUNK_BYTES) return { ok: false, status: 400, error: "未能開啟檔案。" };
  return { ok: true, start: range.start, end: range.end };
}

export function selectDownloadBytes(
  body: Uint8Array,
  start: number,
  end: number,
  expectedSize: number,
  meta: { contentRange?: string | null; contentLength?: number | null } = {},
): Uint8Array | null {
  const length = end - start;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > MAX_FILE_BYTES ||
    start < 0 ||
    end > expectedSize ||
    length <= 0 ||
    length > UPLOAD_CHUNK_BYTES
  ) {
    return null;
  }

  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(meta.contentRange ?? "");
  if (match) {
    if (Number(match[1]) !== start || Number(match[2]) !== end - 1 || Number(match[3]) !== expectedSize) return null;
    if (body.byteLength !== length) return null;
    return body.slice();
  }

  if (body.byteLength === expectedSize && (meta.contentLength == null || meta.contentLength === expectedSize)) {
    return body.slice(start, end);
  }

  if (start === 0 && body.byteLength === length && (meta.contentLength == null || meta.contentLength === length)) {
    return body.slice();
  }

  return null;
}

export function describeDownloadResponse(input: {
  mime: string;
  fileName: string;
  start: number;
  end: number;
  bytes: Uint8Array;
}): { ok: true; headers: Record<string, string>; body: Uint8Array } | { ok: false; status: number; error: string } {
  const length = input.end - input.start;
  if (!isAllowedMime(input.mime) || length <= 0 || length > UPLOAD_CHUNK_BYTES || input.bytes.byteLength !== length) {
    return { ok: false, status: 404, error: "找不到檔案。" };
  }
  if (input.bytes.byteLength >= PLATFORM_BODY_LIMIT_BYTES) {
    return { ok: false, status: 500, error: "未能開啟檔案。" };
  }
  const body = input.bytes.slice();
  return {
    ok: true,
    body,
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": contentDisposition(input.mime, input.fileName),
      "content-length": String(body.byteLength),
      "content-type": input.mime === "text/plain" ? "text/plain; charset=utf-8" : input.mime,
      "x-content-type-options": "nosniff",
    },
  };
}

export function authorizeStoredDownload(actor: DownloadActor, row: StoredAttachment | null): DownloadAccess {
  if (!actor || (actor.role !== "admin" && actor.role !== "client")) {
    return { ok: false, status: 401, error: "請先登入。" };
  }
  if (!row) return { ok: false, status: 404, error: "找不到檔案。" };

  const parts = parseStoragePath(row.storagePath);
  const mime = row.mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  const size = row.sizeBytes;
  const id = row.id.toLowerCase();
  const messageId = row.messageId.toLowerCase();
  const requestId = row.requestId.toLowerCase();
  const requestClientId = row.requestClientId.toLowerCase();
  if (
    !parts ||
    !isUuid(id) ||
    parts.attachmentId !== id ||
    parts.messageId !== messageId ||
    parts.requestId !== requestId ||
    parts.clientId !== requestClientId ||
    !isAllowedMime(mime) ||
    mimeForExtension(parts.extension) !== mime ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_FILE_BYTES
  ) {
    return { ok: false, status: 404, error: "找不到檔案。" };
  }

  const allowed = uploadAllowed({
    role: actor.role,
    sessionClientId: actor.role === "client" ? actor.clientId?.toLowerCase() : undefined,
    pathClientId: parts.clientId,
    requestClientId,
  });
  if (!allowed) return { ok: false, status: 404, error: "找不到檔案。" };
  return {
    ok: true,
    path: row.storagePath,
    fileName: displayFileName(row.fileName),
    mime,
    size,
  };
}
