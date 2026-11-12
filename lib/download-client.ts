import { assembleUpload, expectedPartLength, UPLOAD_CHUNK_BYTES, uploadChunkCount } from "@/lib/upload-plan";
import { attachmentPartPath } from "@/lib/download-plan";

export async function loadAttachmentBytes(
  id: string,
  size: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  const count = uploadChunkCount(size);
  if (count === 0) return null;
  const parts: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const url = attachmentPartPath(id, index);
    const expected = expectedPartLength(size, index);
    if (!url || expected === null || expected > UPLOAD_CHUNK_BYTES) return null;
    const response = await fetchImpl(url, {
      method: "GET",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== expected || bytes.byteLength > UPLOAD_CHUNK_BYTES) return null;
    parts.push(bytes);
  }
  return assembleUpload(size, parts);
}
