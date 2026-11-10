import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string, secret: string): string {
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET is too short");
  }
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function sessionTokenMatches(token: string, tokenHash: string, secret: string): boolean {
  const actual = Buffer.from(hashSessionToken(token, secret), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
