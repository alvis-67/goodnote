import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_FILE_BYTES,
  MAX_FILES,
  buildStoragePath,
  parseStoragePath,
  resolveFile,
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
