import {
  assembleUpload,
  expectedPartLength,
  stagingObjectKey,
  uploadChunkCount,
  type PlannedUpload,
} from "@/lib/upload-plan";

export type ObjectStore = {
  put(path: string, body: Uint8Array, contentType: string): Promise<void>;
  read(path: string): Promise<Uint8Array | null>;
  head(path: string): Promise<{ contentType: string; size: number } | null>;
  remove(path: string): Promise<void>;
};

async function removeStaging(store: ObjectStore, path: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const key = stagingObjectKey(path, index);
    if (!key) continue;
    try {
      await store.remove(key);
    } catch (error) {
      console.error("staging delete failed", error instanceof Error ? error.name : "error");
    }
  }
}

export async function writeUploadPart(
  store: ObjectStore,
  claims: PlannedUpload,
  index: number,
  body: Uint8Array,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = expectedPartLength(claims.size, index);
  if (expected === null || body.byteLength !== expected) return { ok: false, error: "未能上載檔案。" };
  const key = stagingObjectKey(claims.path, index);
  if (!key) return { ok: false, error: "檔案路徑不正確。" };
  try {
    await store.put(key, body, "application/octet-stream");
    return { ok: true };
  } catch (error) {
    console.error("upload part failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "未能上載檔案。" };
  }
}

export async function finishUpload(
  store: ObjectStore,
  claims: PlannedUpload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const count = uploadChunkCount(claims.size);
  if (count === 0) return { ok: false, error: "未能上載檔案。" };
  try {
    const existing = await store.head(claims.path);
    if (existing && existing.size === claims.size && existing.contentType === claims.contentType) {
      await removeStaging(store, claims.path, count);
      return { ok: true };
    }
    const parts: Uint8Array[] = [];
    for (let index = 0; index < count; index += 1) {
      const key = stagingObjectKey(claims.path, index);
      if (!key) return { ok: false, error: "檔案路徑不正確。" };
      const bytes = await store.read(key);
      if (!bytes) return { ok: false, error: "有檔案尚未完成上載。" };
      parts.push(bytes);
    }
    const assembled = assembleUpload(claims.size, parts);
    if (!assembled) return { ok: false, error: "未能上載檔案。" };
    await store.put(claims.path, assembled, claims.contentType);
    const seen = await store.head(claims.path);
    if (!seen || seen.size !== claims.size || seen.contentType !== claims.contentType) {
      return { ok: false, error: "未能上載檔案。" };
    }
    await removeStaging(store, claims.path, count);
    return { ok: true };
  } catch (error) {
    console.error("upload finish failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "未能上載檔案。" };
  }
}
