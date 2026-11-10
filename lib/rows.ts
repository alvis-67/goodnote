export function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

export function asText(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

export function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export function asNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}
