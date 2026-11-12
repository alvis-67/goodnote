import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Thread } from "../components/thread";
import { buildStoragePath, MAX_FILE_BYTES, MAX_FILES } from "./files";
import { loadAttachmentBytes } from "./download-client";
import {
  attachmentFilePath,
  attachmentPartPath,
  authorizeStoredDownload,
  contentDisposition,
  describeDownloadResponse,
  PLATFORM_BODY_LIMIT_BYTES,
  readDownloadPart,
  selectDownloadBytes,
  UPLOAD_CHUNK_BYTES,
  type StoredAttachment,
} from "./download-plan";
import { uploadChunkCount } from "./upload-plan";
import type { MessageRow } from "./database.types";

const clientId = "11111111-1111-4111-8111-111111111111";
const otherClientId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const attachmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function stored(overrides: Partial<StoredAttachment> = {}): StoredAttachment {
  const extension = overrides.storagePath?.split(".").pop() ?? "png";
  return {
    id: attachmentId,
    messageId,
    requestId,
    storagePath: buildStoragePath({
      clientId,
      requestId,
      messageId,
      attachmentId,
      extension,
    }),
    requestClientId: clientId,
    fileName: "1.png",
    mimeType: "image/png",
    sizeBytes: 346297,
    ...overrides,
  };
}

function message(partial: Partial<MessageRow> & Pick<MessageRow, "id" | "kind">): MessageRow {
  return {
    request_id: requestId,
    author_role: "client",
    body: null,
    status_from: null,
    status_to: null,
    stage_from: null,
    stage_to: null,
    created_at: "2026-11-11T02:00:00.000Z",
    ...partial,
  };
}

test("the owning client and an admin can open a file, and other people cannot", () => {
  const row = stored();
  const owner = authorizeStoredDownload({ role: "client", clientId }, row);
  const admin = authorizeStoredDownload({ role: "admin" }, row);
  const stranger = authorizeStoredDownload({ role: "client", clientId: otherClientId }, row);
  const anonymous = authorizeStoredDownload(null, row);
  const anonymousMissing = authorizeStoredDownload(null, null);
  assert.equal(owner.ok, true);
  assert.equal(admin.ok, true);
  if (owner.ok) assert.equal(owner.mime, "image/png");
  if (admin.ok) assert.equal(admin.size, 346297);
  assert.deepEqual(stranger, { ok: false, status: 404, error: "找不到檔案。" });
  assert.deepEqual(anonymous, { ok: false, status: 401, error: "請先登入。" });
  assert.deepEqual(anonymousMissing, { ok: false, status: 401, error: "請先登入。" });
  const missing = authorizeStoredDownload({ role: "client", clientId }, null);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);

  const wrongOwner = stored({
    storagePath: buildStoragePath({
      clientId: otherClientId,
      requestId,
      messageId,
      attachmentId,
      extension: "png",
    }),
  });
  assert.equal(authorizeStoredDownload({ role: "admin" }, wrongOwner).ok, false);
  assert.equal(authorizeStoredDownload({ role: "client", clientId }, wrongOwner).ok, false);

  const swapped = stored({
    storagePath: buildStoragePath({
      clientId,
      requestId,
      messageId,
      attachmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      extension: "png",
    }),
  });
  assert.equal(authorizeStoredDownload({ role: "client", clientId }, swapped).ok, false);
  assert.equal(authorizeStoredDownload({ role: "client", clientId: clientId.toUpperCase() }, row).ok, true);
  assert.equal(
    authorizeStoredDownload({ role: "client", clientId }, stored({ mimeType: "text/html", sizeBytes: 10 })).ok,
    false,
  );
  assert.equal(
    authorizeStoredDownload({ role: "client", clientId }, stored({ sizeBytes: MAX_FILE_BYTES + 1 })).ok,
    false,
  );
  assert.equal(attachmentFilePath("../secret"), null);
  assert.equal(attachmentFilePath("https://storage.example/file"), null);
  assert.equal(attachmentFilePath(attachmentId), `/api/files/${attachmentId}`);
});

test("a 20MB file is served in same-origin parts under the platform body limit", async () => {
  assert.equal(MAX_FILES, 8);
  assert.equal(MAX_FILE_BYTES, 20 * 1024 * 1024);
  assert.ok(UPLOAD_CHUNK_BYTES < PLATFORM_BODY_LIMIT_BYTES);
  assert.ok(MAX_FILE_BYTES > PLATFORM_BODY_LIMIT_BYTES);
  assert.equal(uploadChunkCount(MAX_FILE_BYTES), 5);
  assert.equal(readDownloadPart(null, MAX_FILE_BYTES).ok, false);

  let covered = 0;
  for (let index = 0; index < 5; index += 1) {
    const part = readDownloadPart(String(index), MAX_FILE_BYTES);
    assert.equal(part.ok, true);
    if (!part.ok) return;
    const length = part.end - part.start;
    assert.ok(length > 0);
    assert.ok(length <= UPLOAD_CHUNK_BYTES);
    assert.ok(length < PLATFORM_BODY_LIMIT_BYTES);
    covered += length;
    const url = attachmentPartPath(attachmentId, index);
    assert.equal(url, `/api/files/${attachmentId}?part=${index}`);
    assert.equal(url?.includes("http"), false);
  }
  assert.equal(covered, MAX_FILE_BYTES);
  assert.equal(readDownloadPart("5", MAX_FILE_BYTES).ok, false);
  assert.equal(readDownloadPart("-1", MAX_FILE_BYTES).ok, false);

  const small = readDownloadPart(null, 346297);
  assert.equal(small.ok, true);
  if (!small.ok) return;
  assert.equal(small.end - small.start, 346297);
  const preview = describeDownloadResponse({
    mime: "image/png",
    fileName: "1.png",
    start: small.start,
    end: small.end,
    bytes: new Uint8Array(346297),
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.headers["content-type"], "image/png");
  assert.equal(Number(preview.headers["content-length"]), 346297);
  assert.ok(Number(preview.headers["content-length"]) < PLATFORM_BODY_LIMIT_BYTES);
  assert.equal(preview.headers["cache-control"], "private, no-store");
  assert.match(preview.headers["content-disposition"] ?? "", /^inline;/);
  assert.equal(JSON.stringify(preview.headers).includes("X-Amz"), false);
  assert.equal(JSON.stringify(preview.headers).includes(clientId), false);

  const calls: string[] = [];
  const loaded = await loadAttachmentBytes(attachmentId, MAX_FILE_BYTES, async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(url.startsWith("http"), false);
    const index = Number(new URL(url, "http://local.test").searchParams.get("part"));
    const part = readDownloadPart(String(index), MAX_FILE_BYTES);
    assert.equal(part.ok, true);
    if (!part.ok) throw new Error("part");
    const length = part.end - part.start;
    assert.ok(length <= UPLOAD_CHUNK_BYTES);
    assert.ok(length < PLATFORM_BODY_LIMIT_BYTES);
    const body = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 4096) body[offset] = (part.start + offset) % 251;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/pdf", "content-length": String(length) },
    });
  });
  assert.equal(calls.length, 5);
  assert.equal(loaded?.byteLength, MAX_FILE_BYTES);
  assert.equal(loaded?.[0], 0);
  assert.equal(loaded?.[UPLOAD_CHUNK_BYTES], UPLOAD_CHUNK_BYTES % 251);
  assert.equal(loaded?.[MAX_FILE_BYTES - 4096], (MAX_FILE_BYTES - 4096) % 251);

  const full = new Uint8Array(8);
  full.set([1, 2, 3, 4, 5, 6, 7, 8]);
  const head = selectDownloadBytes(full, 0, 4, 8, { contentLength: 8 });
  const tail = selectDownloadBytes(full.slice(4), 4, 8, 8, { contentRange: "bytes 4-7/8", contentLength: 4 });
  assert.deepEqual([...(head ?? [])], [1, 2, 3, 4]);
  assert.deepEqual([...(tail ?? [])], [5, 6, 7, 8]);
  assert.equal(selectDownloadBytes(full, 0, 8, 8, { contentRange: "bytes 0-7/9" }), null);
  assert.equal(selectDownloadBytes(new Uint8Array(UPLOAD_CHUNK_BYTES + 1), 0, UPLOAD_CHUNK_BYTES + 1, UPLOAD_CHUNK_BYTES + 1), null);

  const tooBig = describeDownloadResponse({
    mime: "application/pdf",
    fileName: "大檔.pdf",
    start: 0,
    end: UPLOAD_CHUNK_BYTES + 1,
    bytes: new Uint8Array(UPLOAD_CHUNK_BYTES + 1),
  });
  assert.equal(tooBig.ok, false);

  const header = contentDisposition("application/pdf", "報價.pdf\"\r\nX-Injected: 1");
  assert.equal(header.includes("\n"), false);
  assert.equal(header.includes("\r"), false);
  assert.match(header, /filename\*=UTF-8''/);
  const office = contentDisposition(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "單據.docx",
  );
  assert.match(office, /^attachment;/);
});

test("the thread previews images and opens files on this origin", () => {
  const jpegId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const html = renderToStaticMarkup(
    createElement(Thread, {
      messages: [message({ id: messageId, kind: "message", body: "請看相片" })],
      attachments: [
        {
          id: attachmentId,
          message_id: messageId,
          file_name: "1.png",
          mime_type: "image/png",
          size_bytes: 346297,
        },
        {
          id: jpegId,
          message_id: messageId,
          file_name: "bk.jpg",
          mime_type: "image/jpeg",
          size_bytes: 31270,
        },
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          message_id: messageId,
          file_name: "報價.pdf",
          mime_type: "application/pdf",
          size_bytes: 1200,
        },
        {
          id: "99999999-9999-4999-8999-999999999999",
          message_id: messageId,
          file_name: "報價.docx",
          mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size_bytes: 800,
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          message_id: messageId,
          file_name: "大圖.png",
          mime_type: "image/png",
          size_bytes: MAX_FILE_BYTES,
        },
        {
          id: "local-file",
          message_id: messageId,
          file_name: "未完成.pdf",
          mime_type: "application/pdf",
          size_bytes: 10,
        },
      ],
    }),
  );
  assert.match(html, new RegExp(`<img src="/api/files/${attachmentId}"`));
  assert.match(html, new RegExp(`<img src="/api/files/${jpegId}"`));
  assert.match(html, new RegExp(`href="/api/files/${attachmentId}"`));
  assert.match(html, /href="\/api\/files\/ffffffff-ffff-4fff-8fff-ffffffffffff"/);
  assert.match(html, /href="\/api\/files\/99999999-9999-4999-8999-999999999999"/);
  assert.match(html, /大圖\.png/);
  assert.equal(html.includes(`<img src="/api/files/88888888-8888-4888-8888-888888888888"`), false);
  assert.match(html, /未完成\.pdf/);
  assert.equal(html.includes('href="/api/files/local-file"'), false);
  assert.doesNotMatch(html, /X-Amz|amazonaws|neon\.tech|storage_path|https?:\/\//);

  const thread = readFileSync(new URL("../components/thread.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/files/[id]/route.ts", import.meta.url), "utf8");
  const download = readFileSync(new URL("./download.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const cache = readFileSync(new URL("./view-cache.ts", import.meta.url), "utf8");

  assert.doesNotMatch(thread, /storage_path|signedDownload|getSignedUrl/);
  assert.doesNotMatch(clientPage, /signAttachmentPaths|signedDownloadUrl|Composer/);
  assert.doesNotMatch(adminPage, /signAttachmentPaths|signedDownloadUrl/);
  assert.match(adminPage, /<Composer audience="admin" mode="reply"/);
  const openAt = route.indexOf("openAttachmentDownload");
  const readAt = route.indexOf("readObjectRange");
  assert.ok(openAt > -1 && readAt > openAt);
  assert.doesNotMatch(route, /getSignedUrl|signedDownloadUrl|storage_path/);
  assert.match(download, /authorizeStoredDownload/);
  assert.match(readFileSync(new URL("./download-plan.ts", import.meta.url), "utf8"), /parseStoragePath/);
  assert.match(download, /a\.client_id = r\.client_id/);
  assert.match(storage, /Range: `bytes=\$\{start\}-\$\{end - 1\}`/);
  assert.match(storage, /readObjectBytes/);
  assert.doesNotMatch(storage, /getSignedUrl|signedDownloadUrl/);
  assert.doesNotMatch(cache, /storage_path/);
  assert.equal(cache.includes("https://"), false);
});
