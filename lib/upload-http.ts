import { expectedPartLength, partBodyLengthOk, UPLOAD_CHUNK_BYTES } from "@/lib/upload-plan";
import { verifyUploadGrant, type UploadGrantClaims } from "@/lib/upload-grant";

export function declaredBodyTooLarge(contentLength: string | null, maxBytes: number): boolean {
  if (contentLength === null) return false;
  if (!/^\d+$/.test(contentLength)) return true;
  const declared = Number(contentLength);
  return !Number.isSafeInteger(declared) || declared > maxBytes;
}

export function bodyLengthMismatch(contentLength: string | null, byteLength: number): boolean {
  if (contentLength === null) return false;
  if (!/^\d+$/.test(contentLength)) return true;
  return Number(contentLength) !== byteLength;
}

function headerValue(headers: { get(name: string): string | null }, name: string, max: number): string | null {
  const value = headers.get(name);
  if (value === null) return null;
  if (value.length === 0 || value.length > max || value.includes("\n") || value.includes("\r")) return null;
  return value;
}

export function readPartMeta(
  headers: { get(name: string): string | null },
  secret: string,
  nowSeconds: number,
): { ok: true; claims: UploadGrantClaims; index: number } | { ok: false; status: number; error: string } {
  const path = headerValue(headers, "x-goodnote-path", 300);
  const grant = headerValue(headers, "x-goodnote-grant", 4000);
  const indexHeader = headerValue(headers, "x-goodnote-index", 3);
  if (!path || !grant || !indexHeader || !/^(0|[1-9]\d{0,2})$/.test(indexHeader)) {
    return { ok: false, status: 400, error: "檔案路徑不正確。" };
  }
  const verified = verifyUploadGrant(grant, secret, nowSeconds);
  if (!verified.ok) {
    return {
      ok: false,
      status: 400,
      error: verified.reason === "expired" ? "上載已逾時，請再送出一次。" : "檔案路徑不正確。",
    };
  }
  if (verified.claims.path !== path) return { ok: false, status: 400, error: "檔案路徑不正確。" };
  const index = Number(indexHeader);
  if (expectedPartLength(verified.claims.size, index) === null) {
    return { ok: false, status: 400, error: "未能上載檔案。" };
  }
  return { ok: true, claims: verified.claims, index };
}

export function partBytesAccepted(size: number, index: number, byteLength: number): boolean {
  return byteLength <= UPLOAD_CHUNK_BYTES && partBodyLengthOk(size, index, byteLength);
}

export function readCompleteBody(
  value: unknown,
  secret: string,
  nowSeconds: number,
): { ok: true; claims: UploadGrantClaims } | { ok: false; status: number; error: string } {
  if (!value || typeof value !== "object") return { ok: false, status: 400, error: "未能上載檔案。" };
  const record = value as Record<string, unknown>;
  if (record.op !== "complete" || typeof record.path !== "string" || typeof record.grant !== "string") {
    return { ok: false, status: 400, error: "未能上載檔案。" };
  }
  if (record.path.length > 300 || record.grant.length > 4000) {
    return { ok: false, status: 400, error: "檔案路徑不正確。" };
  }
  const verified = verifyUploadGrant(record.grant, secret, nowSeconds);
  if (!verified.ok) {
    return {
      ok: false,
      status: 400,
      error: verified.reason === "expired" ? "上載已逾時，請再送出一次。" : "檔案路徑不正確。",
    };
  }
  if (verified.claims.path !== record.path) return { ok: false, status: 400, error: "檔案路徑不正確。" };
  return { ok: true, claims: verified.claims };
}
