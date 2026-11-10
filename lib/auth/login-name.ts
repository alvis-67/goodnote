const LOGIN_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._@+-]{1,39}$/u;

export function normalizeLoginName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!LOGIN_NAME.test(trimmed)) return null;
  return trimmed;
}
