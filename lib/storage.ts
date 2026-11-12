import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { selectDownloadBytes } from "@/lib/download-plan";
import { storageEnv } from "@/lib/env";
import { MAX_FILE_BYTES, STORAGE_BUCKET } from "@/lib/files";
import type { ObjectStore } from "@/lib/upload-object";
import { isStagingPrefix, UPLOAD_CHUNK_BYTES } from "@/lib/upload-plan";

let client: S3Client | undefined;

function s3(): S3Client {
  if (!client) {
    const env = storageEnv();
    client = new S3Client({
      region: env.region,
      endpoint: env.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const metadata =
    "$metadata" in error && error.$metadata && typeof error.$metadata === "object"
      ? (error.$metadata as { httpStatusCode?: number })
      : null;
  return name === "NotFound" || name === "NoSuchKey" || metadata?.httpStatusCode === 404;
}

export async function putObjectBytes(path: string, body: Uint8Array, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: path,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
}

export async function readObjectBytes(path: string): Promise<Uint8Array | null> {
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: path }));
    if (!result.Body) return null;
    return await result.Body.transformToByteArray();
  } catch (error) {
    if (!isMissingObject(error)) {
      console.error("object read failed", error instanceof Error ? error.name : "error");
    }
    return null;
  }
}

export async function readObjectRange(
  path: string,
  start: number,
  end: number,
  expectedSize: number,
): Promise<Uint8Array | null> {
  const length = end - start;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(expectedSize) ||
    start < 0 ||
    length <= 0 ||
    length > UPLOAD_CHUNK_BYTES ||
    end > expectedSize ||
    expectedSize > MAX_FILE_BYTES
  ) {
    return null;
  }
  try {
    const result = await s3().send(
      new GetObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: path,
        Range: `bytes=${start}-${end - 1}`,
      }),
    );
    if (result.Body) {
      const body = await result.Body.transformToByteArray();
      const selected = selectDownloadBytes(body, start, end, expectedSize, {
        contentRange: result.ContentRange,
        contentLength: result.ContentLength,
      });
      if (selected) return selected;
    }
  } catch (error) {
    if (isMissingObject(error)) return null;
    console.error("object range read failed", error instanceof Error ? error.name : "error");
  }
  const full = await readObjectBytes(path);
  if (!full) return null;
  return selectDownloadBytes(full, start, end, expectedSize, { contentLength: full.byteLength });
}

export async function inspectObject(path: string): Promise<{ contentType: string; size: number } | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: STORAGE_BUCKET, Key: path }));
    const contentType = (head.ContentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    const size = Number(head.ContentLength ?? 0);
    if (!contentType || !Number.isFinite(size)) return null;
    return { contentType, size };
  } catch (error) {
    if (!isMissingObject(error)) {
      console.error("object inspect failed", error instanceof Error ? error.name : "error");
    }
    return null;
  }
}

export function storageObjectStore(): ObjectStore {
  return {
    put: putObjectBytes,
    read: readObjectBytes,
    head: inspectObject,
    remove: deleteObject,
  };
}

export async function deleteStagingPrefix(prefix: string): Promise<void> {
  if (!isStagingPrefix(prefix)) return;
  let token: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await s3().send(
      new ListObjectsV2Command({
        Bucket: STORAGE_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (listed.Contents ?? []).flatMap((item) => {
      const key = item.Key ?? "";
      return key.startsWith(prefix) ? [key] : [];
    });
    await Promise.all(
      keys.map(async (key) => {
        try {
          await deleteObject(key);
        } catch (error) {
          console.error("staging delete failed", error instanceof Error ? error.name : "error");
        }
      }),
    );
    if (!listed.IsTruncated || !listed.NextContinuationToken) return;
    token = listed.NextContinuationToken;
  }
}

export async function deleteObject(path: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: path }));
}
