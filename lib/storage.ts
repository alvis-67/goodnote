import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { storageEnv } from "@/lib/env";
import { STORAGE_BUCKET } from "@/lib/files";

const UPLOAD_SECONDS = 10 * 60;
const DOWNLOAD_SECONDS = 2 * 60 * 60;

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

export async function createUploadUrl(path: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: path,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_SECONDS },
  );
}

export async function inspectObject(path: string): Promise<{ contentType: string; size: number } | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: STORAGE_BUCKET, Key: path }));
    const contentType = (head.ContentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    const size = Number(head.ContentLength ?? 0);
    if (!contentType || !Number.isFinite(size)) return null;
    return { contentType, size };
  } catch (error) {
    console.error("object inspect failed", error instanceof Error ? error.name : "error");
    return null;
  }
}

export async function deleteObject(path: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: path }));
}

export async function signedDownloadUrl(path: string): Promise<string | null> {
  try {
    return await getSignedUrl(s3(), new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: path }), {
      expiresIn: DOWNLOAD_SECONDS,
    });
  } catch (error) {
    console.error("signed download failed", error instanceof Error ? error.name : "error");
    return null;
  }
}
