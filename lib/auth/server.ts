import { createNeonAuth, type NeonAuth } from "@neon/auth/next/server";

import { ConfigError, hasAuthEnv } from "@/lib/env";

let instance: NeonAuth | undefined;

export function getAuth(): NeonAuth {
  if (!hasAuthEnv()) throw new ConfigError();
  if (!instance) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl || !secret) throw new ConfigError();
    instance = createNeonAuth({
      baseUrl,
      cookies: { secret },
    });
  }
  return instance;
}
