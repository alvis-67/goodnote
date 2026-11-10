import { randomBytes } from "node:crypto";

const ACCESS_TOKEN = /^[A-Za-z0-9_-]{43,128}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isAccessToken(value: string): boolean {
  return ACCESS_TOKEN.test(value);
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
