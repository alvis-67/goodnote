// Uploads and downloads go through the app server. This policy is not required for that path.
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const bucket = "request-files";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const region = process.env.AWS_REGION;

if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
  console.error("Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, and AWS_REGION.");
  process.exit(1);
}

const origins = (process.env.STORAGE_CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  }),
);

console.log(`CORS updated on ${bucket} for ${origins.join(", ")}`);
