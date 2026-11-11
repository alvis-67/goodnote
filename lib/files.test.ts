import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_FILE_BYTES,
  MAX_FILES,
  appendPickedFiles,
  buildStoragePath,
  parseStoragePath,
  resolveFile,
  storageKeysByRequest,
  storageKeysForRequest,
  validateFiles,
} from "./files";

test("accepts a phone photo even when the browser omits the mime type", () => {
  const resolved = resolveFile({ name: "單據.HEIC", type: "", size: 1200 });
  assert.equal(resolved?.mime, "image/heic");
  assert.equal(resolved?.extension, "heic");
  assert.equal(resolved?.fileName, "單據.HEIC");
});

test("rejects a mime that does not match the extension", () => {
  assert.equal(resolveFile({ name: "quote.pdf", type: "image/png", size: 100 }), null);
});

test("a chosen file is kept, and a file that cannot be added is rejected immediately", () => {
  const current = [{ name: "已有.pdf", type: "application/pdf", size: 20 }];
  const photo = appendPickedFiles(current, [{ name: "單據.HEIC", type: "", size: 1200 }]);
  assert.equal(photo.error, null);
  assert.deepEqual(
    photo.files.map((file) => file.name),
    ["已有.pdf", "單據.HEIC"],
  );
  assert.deepEqual(current, [{ name: "已有.pdf", type: "application/pdf", size: 20 }]);

  const mixed = appendPickedFiles([], [
    { name: "報價.pdf", type: "application/pdf", size: 4096 },
    { name: "太大.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 },
    { name: "病毒.exe", type: "application/octet-stream", size: 50 },
    { name: "空白.txt", type: "text/plain", size: 0 },
  ]);
  assert.deepEqual(
    mixed.files.map((file) => file.name),
    ["報價.pdf"],
  );
  assert.match(mixed.error ?? "", /「太大\.pdf」超過 20MB。/);
  assert.match(mixed.error ?? "", /「病毒\.exe」的格式不支援。請上載相片、PDF 或常見的文件。/);
  assert.match(mixed.error ?? "", /「空白\.txt」是空檔案，未能加入。/);

  const full = appendPickedFiles(
    Array.from({ length: MAX_FILES }, (_, index) => ({
      name: `${index}.pdf`,
      type: "application/pdf",
      size: 10,
    })),
    [{ name: "多一個.pdf", type: "application/pdf", size: 10 }],
  );
  assert.equal(full.files.length, MAX_FILES);
  assert.match(full.error ?? "", /最多上載 8 個檔案。/);
  assert.equal(validateFiles([{ name: "空白.txt", type: "text/plain", size: 0 }]), "「空白.txt」是空檔案，未能加入。");
});

test("rejects oversized and too many files with a Chinese message", () => {
  assert.match(
    validateFiles([{ name: "a.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 }]) ?? "",
    /20MB/,
  );
  const files = Array.from({ length: MAX_FILES + 1 }, (_, index) => ({
    name: `${index}.pdf`,
    type: "application/pdf",
    size: 10,
  }));
  assert.match(validateFiles(files) ?? "", /最多上載/);
});

test("storage paths stay inside the client, request, and message", () => {
  const path = buildStoragePath({
    clientId: "11111111-1111-4111-8111-111111111111",
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    extension: "pdf",
  });
  assert.deepEqual(parseStoragePath(path), {
    clientId: "11111111-1111-4111-8111-111111111111",
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    extension: "pdf",
  });
  assert.equal(parseStoragePath(`../${path}`), null);
  assert.equal(parseStoragePath(`${path}.html`), null);
});

test("deleting a request only removes that request's stored files", () => {
  const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const own = buildStoragePath({
    clientId: "11111111-1111-4111-8111-111111111111",
    requestId,
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    extension: "pdf",
  });
  const other = buildStoragePath({
    clientId: "11111111-1111-4111-8111-111111111111",
    requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    extension: "pdf",
  });
  assert.deepEqual(storageKeysForRequest(requestId, [own, own, other, "../secret", ""]), [own]);
});

test("deleting a client groups stored files by request and drops paths from other requests", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const quoteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const invoiceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const quoteFile = buildStoragePath({
    clientId,
    requestId: quoteId,
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    extension: "pdf",
  });
  const invoiceFile = buildStoragePath({
    clientId,
    requestId: invoiceId,
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachmentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    extension: "jpg",
  });
  const mismatched = buildStoragePath({
    clientId,
    requestId: invoiceId,
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachmentId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    extension: "png",
  });
  assert.deepEqual(
    storageKeysByRequest([
      { requestId: quoteId, path: quoteFile },
      { requestId: quoteId, path: quoteFile },
      { requestId: invoiceId, path: invoiceFile },
      { requestId: quoteId, path: mismatched },
      { requestId: quoteId, path: "../secret" },
      { requestId: " ", path: quoteFile },
    ]),
    [
      { requestId: quoteId, paths: [quoteFile] },
      { requestId: invoiceId, paths: [invoiceFile] },
    ],
  );
});
