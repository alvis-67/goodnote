import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildStoragePath, MAX_FILE_BYTES, MAX_FILES, parseStoragePath } from "./files";
import { signUploadGrant, UPLOAD_GRANT_SECONDS, verifyUploadGrant } from "./upload-grant";
import {
  bodyLengthMismatch,
  declaredBodyTooLarge,
  partBytesAccepted,
  readCompleteBody,
  readPartMeta,
} from "./upload-http";
import { finishUpload, writeUploadPart, type ObjectStore } from "./upload-object";
import {
  isStagingPrefix,
  MAX_UPLOAD_CHUNKS,
  PLATFORM_BODY_LIMIT_BYTES,
  sameOriginCompletePlan,
  sameOriginPartPlan,
  stagingObjectKey,
  stagingPrefixForRequest,
  UPLOAD_CHUNK_BYTES,
  uploadAllowed,
  uploadChunkCount,
} from "./upload-plan";

const secret = "test-only-session-secret-32chars-min";
const now = 1_700_000_000;
const clientId = "11111111-1111-4111-8111-111111111111";
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function pdfPath(): string {
  return buildStoragePath({
    clientId,
    requestId,
    messageId,
    attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    extension: "pdf",
  });
}

function memoryStore(): { store: ObjectStore; objects: Map<string, { body: Uint8Array; contentType: string }> } {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const store: ObjectStore = {
    async put(path, body, contentType) {
      objects.set(path, { body: new Uint8Array(body), contentType });
    },
    async read(path) {
      const found = objects.get(path);
      return found ? new Uint8Array(found.body) : null;
    },
    async head(path) {
      const found = objects.get(path);
      if (!found) return null;
      const contentType = found.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
      return { contentType, size: found.body.byteLength };
    },
    async remove(path) {
      objects.delete(path);
    },
  };
  return { store, objects };
}

test("a 20MB file is posted to this app in chunks under the platform body limit", () => {
  assert.equal(MAX_FILE_BYTES, 20 * 1024 * 1024);
  assert.equal(MAX_FILES, 8);
  assert.ok(UPLOAD_CHUNK_BYTES < PLATFORM_BODY_LIMIT_BYTES);
  assert.ok(MAX_FILE_BYTES > PLATFORM_BODY_LIMIT_BYTES);
  assert.equal(uploadChunkCount(MAX_FILE_BYTES), 5);
  assert.equal(MAX_UPLOAD_CHUNKS, 5);
  assert.equal(uploadChunkCount(MAX_FILE_BYTES + 1), 0);
  assert.equal(uploadChunkCount(0), 0);

  const path = pdfPath();
  const grant = signUploadGrant(
    { path, size: MAX_FILE_BYTES, contentType: "application/pdf", fileName: "大檔.pdf" },
    secret,
    now,
  );
  assert.ok(grant);
  let covered = 0;
  for (let file = 0; file < MAX_FILES; file += 1) {
    const parts = sameOriginPartPlan(MAX_FILE_BYTES, { path, size: MAX_FILE_BYTES, grant: grant ?? "" });
    assert.ok(parts);
    assert.equal(parts.length, 5);
    for (const part of parts) {
      const length = part.end - part.start;
      assert.equal(part.url, "/api/uploads");
      assert.equal(part.method, "POST");
      assert.equal(part.url.includes("http"), false);
      assert.equal(part.headers["content-type"], "application/octet-stream");
      assert.ok(length > 0);
      assert.ok(length <= UPLOAD_CHUNK_BYTES);
      assert.ok(length < PLATFORM_BODY_LIMIT_BYTES);
      if (file === 0) covered += length;
    }
  }
  assert.equal(covered, MAX_FILE_BYTES);
  assert.equal(declaredBodyTooLarge(String(UPLOAD_CHUNK_BYTES), UPLOAD_CHUNK_BYTES), false);
  assert.equal(declaredBodyTooLarge(String(UPLOAD_CHUNK_BYTES + 1), UPLOAD_CHUNK_BYTES), true);
  assert.equal(declaredBodyTooLarge("nope", UPLOAD_CHUNK_BYTES), true);
});

test("chunked bytes are reassembled and stored without a browser PUT to storage", async () => {
  const path = pdfPath();
  const size = UPLOAD_CHUNK_BYTES + 25;
  const original = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) original[index] = index % 251;
  const grant = signUploadGrant(
    { path, size, contentType: "application/pdf", fileName: "報價.pdf" },
    secret,
    now,
  );
  assert.ok(grant);
  const ticket = { path, size, grant };
  const plan = sameOriginPartPlan(size, ticket);
  const complete = sameOriginCompletePlan(ticket);
  assert.ok(plan);
  assert.equal(plan.length, 2);
  assert.ok(complete);
  assert.equal(complete.url, "/api/uploads");
  assert.equal(JSON.stringify(complete.body).includes("http://"), false);

  const { store, objects } = memoryStore();
  for (const part of plan) {
    const headers = new Headers(part.headers);
    const meta = readPartMeta(headers, secret, now);
    assert.equal(meta.ok, true);
    if (!meta.ok) return;
    const body = original.slice(part.start, part.end);
    assert.equal(partBytesAccepted(meta.claims.size, meta.index, body.byteLength), true);
    const written = await writeUploadPart(store, meta.claims, meta.index, body);
    assert.equal(written.ok, true);
  }

  const parsed = readCompleteBody(complete.body, secret, now);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const finished = await finishUpload(store, parsed.claims);
  assert.deepEqual(finished, { ok: true });
  const stored = objects.get(path);
  assert.ok(stored);
  assert.equal(stored.contentType, "application/pdf");
  assert.equal(Buffer.from(stored.body).equals(Buffer.from(original)), true);
  for (const key of objects.keys()) assert.equal(key.startsWith("staging/"), false);

  objects.delete(stagingObjectKey(path, 0) ?? "");
  const again = await finishUpload(store, parsed.claims);
  assert.deepEqual(again, { ok: true });
});

test("a missing chunk does not publish the object", async () => {
  const path = pdfPath();
  const size = UPLOAD_CHUNK_BYTES + 8;
  const grant = signUploadGrant(
    { path, size, contentType: "application/pdf", fileName: "半份.pdf" },
    secret,
    now,
  );
  assert.ok(grant);
  const { store, objects } = memoryStore();
  const written = await writeUploadPart(store, { path, size, contentType: "application/pdf", fileName: "半份.pdf" }, 0, new Uint8Array(UPLOAD_CHUNK_BYTES));
  assert.equal(written.ok, true);
  const finished = await finishUpload(store, { path, size, contentType: "application/pdf", fileName: "半份.pdf" });
  assert.deepEqual(finished, { ok: false, error: "有檔案尚未完成上載。" });
  assert.equal(objects.has(path), false);
  const wrong = await writeUploadPart(
    store,
    { path, size, contentType: "application/pdf", fileName: "半份.pdf" },
    1,
    new Uint8Array(7),
  );
  assert.equal(wrong.ok, false);
});

test("upload grants expire, reject tampering, and stay bound to the file", () => {
  const path = pdfPath();
  const grant = signUploadGrant(
    { path, size: 12, contentType: "application/pdf", fileName: "報價.pdf" },
    secret,
    now,
  );
  assert.ok(grant);
  assert.equal(verifyUploadGrant(grant, secret, now).ok, true);
  assert.equal(verifyUploadGrant(grant, secret, now + UPLOAD_GRANT_SECONDS - 1).ok, true);
  const expired = verifyUploadGrant(grant, secret, now + UPLOAD_GRANT_SECONDS);
  assert.deepEqual(expired, { ok: false, reason: "expired" });
  const headers = new Headers({
    "x-goodnote-path": path,
    "x-goodnote-index": "0",
    "x-goodnote-grant": grant,
  });
  const fresh = readPartMeta(headers, secret, now);
  assert.equal(fresh.ok, true);
  const late = readPartMeta(headers, secret, now + UPLOAD_GRANT_SECONDS);
  assert.deepEqual(late, { ok: false, status: 400, error: "上載已逾時，請再送出一次。" });

  const dot = grant.indexOf(".");
  const tampered = `${grant.slice(0, dot - 1)}${grant[dot - 1] === "a" ? "b" : "a"}${grant.slice(dot)}`;
  assert.equal(verifyUploadGrant(tampered, secret, now).ok, false);
  assert.equal(signUploadGrant({ path, size: 12, contentType: "image/png", fileName: "報價.pdf" }, secret, now), null);
  assert.equal(signUploadGrant({ path, size: MAX_FILE_BYTES + 1, contentType: "application/pdf", fileName: "報價.pdf" }, secret, now), null);
  assert.equal(signUploadGrant({ path, size: 12, contentType: "application/pdf", fileName: "a/報價.pdf" }, secret, now), null);
  assert.equal(signUploadGrant({ path, size: 12, contentType: "application/pdf", fileName: "報價.pdf" }, "short", now), null);
  assert.equal(partBytesAccepted(12, 0, 12), true);
  assert.equal(partBytesAccepted(12, 0, 11), false);
  assert.equal(partBytesAccepted(12, 1, 1), false);
  assert.equal(bodyLengthMismatch("12", 12), false);
  assert.equal(bodyLengthMismatch("12", 11), true);

  headers.set("x-goodnote-path", path.replace(".pdf", ".png"));
  assert.equal(readPartMeta(headers, secret, now).ok, false);
  const complete = readCompleteBody({ op: "complete", path, grant }, secret, now);
  assert.equal(complete.ok, true);
  assert.equal(readCompleteBody({ op: "complete", path: "other", grant }, secret, now).ok, false);
});

test("only the owning client or an admin can write a prepared object", () => {
  assert.equal(
    uploadAllowed({ role: "client", sessionClientId: clientId, pathClientId: clientId, requestClientId: clientId }),
    true,
  );
  assert.equal(
    uploadAllowed({
      role: "client",
      sessionClientId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      pathClientId: clientId,
      requestClientId: clientId,
    }),
    false,
  );
  assert.equal(uploadAllowed({ role: "admin", pathClientId: clientId, requestClientId: clientId }), true);
  assert.equal(
    uploadAllowed({ role: "admin", pathClientId: clientId, requestClientId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }),
    false,
  );

  const path = pdfPath();
  const key = stagingObjectKey(path, 0);
  assert.ok(key);
  assert.equal(parseStoragePath(key ?? ""), null);
  assert.equal(parseStoragePath(path)?.extension, "pdf");
  const prefix = stagingPrefixForRequest(clientId, requestId);
  assert.equal(prefix, `staging/${clientId}/${requestId}/`);
  assert.equal(isStagingPrefix(prefix ?? ""), true);
  assert.ok(key?.startsWith(prefix ?? "nope"));
  assert.equal(isStagingPrefix("staging/"), false);
  assert.equal(isStagingPrefix(`../${prefix}`), false);
  assert.equal(stagingPrefixForRequest("not-a-uuid", requestId), null);
});

test("the browser upload path stays on this origin for clients and admins", () => {
  const composer = readFileSync(new URL("../components/composer.tsx", import.meta.url), "utf8");
  const uploads = readFileSync(new URL("./uploads.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");

  assert.match(composer, /sameOriginPartPlan\(/);
  assert.match(composer, /sameOriginCompletePlan\(/);
  assert.match(composer, /credentials: "same-origin"/);
  assert.match(composer, /redirect: "error"/);
  assert.match(composer, /prepareClientRequest/);
  assert.match(composer, /prepareAdminReply/);
  assert.match(composer, /finalizeClientUploads/);
  assert.match(composer, /finalizeAdminUploads/);
  assert.doesNotMatch(composer, /ticket\.url/);
  assert.doesNotMatch(composer, /prepareClientReply/);

  assert.match(uploads, /signUploadGrant/);
  assert.match(uploads, /authorizeUpload/);
  assert.match(uploads, /deleteStagingPrefix/);
  assert.doesNotMatch(uploads, /createUploadUrl/);
  assert.doesNotMatch(storage, /createUploadUrl/);

  const authAt = route.indexOf("const auth = await authorizeUpload");
  const storedAt = route.indexOf("auth.stored");
  const writeAt = route.indexOf("await writeUploadPart");
  const finishAt = route.indexOf("await finishUpload");
  const saveAt = route.indexOf("await finalizeUploads");
  assert.ok(authAt > -1);
  assert.ok(authAt < storedAt && storedAt < writeAt && writeAt < finishAt && finishAt < saveAt);
  assert.match(route, /application\/octet-stream/);
  assert.doesNotMatch(route, /getSignedUrl|createUploadUrl/);
  assert.match(client, /prepareUploads/);
  assert.match(admin, /prepareUploads/);
  assert.match(admin, /deleteRequestFiles\(\s*requestId,\s*files\.map\(\(file\) => String\(file\.storage_path \?\? ""\)\),\s*clientId,/);
  assert.match(admin, /deleteRequestFiles\(group\.requestId, group\.paths, clientId\)/);
});
