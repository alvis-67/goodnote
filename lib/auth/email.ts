const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const value = email.trim().toLowerCase();
  if (!EMAIL.test(value) || value.length > 200) return null;
  return value;
}
