export class ConfigError extends Error {
  constructor() {
    super("Missing Neon environment");
    this.name = "ConfigError";
  }
}

export function hasDatabaseEnv(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function hasAuthEnv(): boolean {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET ?? "";
  return Boolean(process.env.NEON_AUTH_BASE_URL) && secret.length >= 32;
}

export function hasStorageEnv(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_ENDPOINT_URL_S3 &&
      process.env.AWS_REGION,
  );
}

export function isDeskReady(): boolean {
  return hasDatabaseEnv() && hasAuthEnv();
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new ConfigError();
  return url;
}

export function storageEnv(): {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
} {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  if (!accessKeyId || !secretAccessKey || !endpoint || !region) throw new ConfigError();
  return { accessKeyId, secretAccessKey, endpoint, region };
}
