import { createHmac, timingSafeEqual } from "node:crypto";

import { displayFileName, MAX_FILE_BYTES } from "@/lib/files";
import { contentTypeForPath, type PlannedUpload } from "@/lib/upload-plan";

export const UPLOAD_GRANT_SECONDS = 60 * 60;

export type UploadGrantClaims = PlannedUpload & { exp: number };

export function signUploadGrant(
  input: PlannedUpload,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  if (secret.length < 32 || !Number.isSafeInteger(nowSeconds)) return null;
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_FILE_BYTES) return null;
  const contentType = contentTypeForPath(input.path);
  if (!contentType || contentType !== input.contentType) return null;
  const fileName = displayFileName(input.fileName);
  if (fileName !== input.fileName) return null;
  const claims: UploadGrantClaims = {
    path: input.path,
    size: input.size,
    contentType,
    fileName,
    exp: nowSeconds + UPLOAD_GRANT_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUploadGrant(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { ok: true; claims: UploadGrantClaims } | { ok: false; reason: "expired" | "invalid" } {
  if (secret.length < 32 || !Number.isSafeInteger(nowSeconds)) return { ok: false, reason: "invalid" };
  if (token.length < 40 || token.length > 4000) return { ok: false, reason: "invalid" };
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return { ok: false, reason: "invalid" };
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: "invalid" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "invalid" };
  const record = parsed as Record<string, unknown>;
  const path = record.path;
  const size = record.size;
  const contentType = record.contentType;
  const fileName = record.fileName;
  const exp = record.exp;
  if (typeof path !== "string" || typeof contentType !== "string" || typeof fileName !== "string") {
    return { ok: false, reason: "invalid" };
  }
  if (typeof size !== "number" || typeof exp !== "number") return { ok: false, reason: "invalid" };
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(exp)) return { ok: false, reason: "invalid" };
  const expectedType = contentTypeForPath(path);
  if (
    !expectedType ||
    expectedType !== contentType ||
    size <= 0 ||
    size > MAX_FILE_BYTES ||
    fileName !== displayFileName(fileName) ||
    exp > nowSeconds + UPLOAD_GRANT_SECONDS + 60
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (exp <= nowSeconds) return { ok: false, reason: "expired" };
  return {
    ok: true,
    claims: { path, size, contentType: expectedType, fileName, exp },
  };
}
