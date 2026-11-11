import { revalidatePath } from "next/cache";

import { adminRequestPath, clientRequestPath } from "@/lib/paths";
import { sessionSecret } from "@/lib/env";
import { storageObjectStore } from "@/lib/storage";
import { authorizeUpload, finalizeUploads } from "@/lib/uploads";
import {
  bodyLengthMismatch,
  declaredBodyTooLarge,
  partBytesAccepted,
  readCompleteBody,
  readPartMeta,
} from "@/lib/upload-http";
import { finishUpload, writeUploadPart } from "@/lib/upload-object";
import { UPLOAD_CHUNK_BYTES, type PlannedUpload } from "@/lib/upload-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPLETE_BODY_BYTES = 8192;

function json(status: number, body: { ok: true } | { ok: false; error: string }): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function readSecret(): string | null {
  try {
    return sessionSecret();
  } catch {
    return null;
  }
}

async function commitUpload(
  kind: "part" | "complete",
  claims: PlannedUpload,
  index: number | null,
  body: Uint8Array | null,
): Promise<Response> {
  const auth = await authorizeUpload(claims.path);
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });
  if (auth.stored) {
    if (kind === "part") return json(409, { ok: false, error: "檔案已經儲存。" });
    return json(200, { ok: true });
  }

  const store = storageObjectStore();
  if (kind === "part") {
    if (index === null || !body) return json(400, { ok: false, error: "未能上載檔案。" });
    const written = await writeUploadPart(store, claims, index, body);
    if (!written.ok) return json(400, { ok: false, error: written.error });
    return json(200, { ok: true });
  }

  const finished = await finishUpload(store, claims);
  if (!finished.ok) return json(400, { ok: false, error: finished.error });
  const saved = await finalizeUploads({
    clientId: auth.clientId,
    requestId: auth.requestId,
    messageId: auth.messageId,
    files: [{ path: claims.path, fileName: claims.fileName }],
  });
  if (!saved.ok) return json(500, { ok: false, error: saved.error });
  revalidatePath(clientRequestPath(auth.requestId));
  revalidatePath(adminRequestPath(auth.requestId));
  return json(200, { ok: true });
}

export async function POST(request: Request): Promise<Response> {
  const secret = readSecret();
  if (!secret) return json(503, { ok: false, error: "系統尚未完成設定。" });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";

  try {
    if (contentType === "application/json") {
      if (declaredBodyTooLarge(request.headers.get("content-length"), COMPLETE_BODY_BYTES)) {
        return json(400, { ok: false, error: "未能上載檔案。" });
      }
      const text = await request.text();
      if (text.length > COMPLETE_BODY_BYTES) return json(400, { ok: false, error: "未能上載檔案。" });
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return json(400, { ok: false, error: "未能上載檔案。" });
      }
      const parsed = readCompleteBody(value, secret, nowSeconds);
      if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
      return await commitUpload("complete", parsed.claims, null, null);
    }

    if (contentType === "application/octet-stream") {
      const contentLength = request.headers.get("content-length");
      if (declaredBodyTooLarge(contentLength, UPLOAD_CHUNK_BYTES)) {
        return json(413, { ok: false, error: "未能上載檔案。" });
      }
      const parsed = readPartMeta(request.headers, secret, nowSeconds);
      if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > UPLOAD_CHUNK_BYTES || bodyLengthMismatch(contentLength, bytes.byteLength)) {
        return json(413, { ok: false, error: "未能上載檔案。" });
      }
      if (!partBytesAccepted(parsed.claims.size, parsed.index, bytes.byteLength)) {
        return json(400, { ok: false, error: "未能上載檔案。" });
      }
      return await commitUpload("part", parsed.claims, parsed.index, bytes);
    }

    return json(415, { ok: false, error: "未能上載檔案。" });
  } catch (error) {
    console.error("upload request failed", error instanceof Error ? error.name : "error");
    return json(500, { ok: false, error: "未能上載檔案。" });
  }
}
