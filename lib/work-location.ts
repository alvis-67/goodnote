export const MAX_WORK_LOCATION_LENGTH = 120;

export function parseWorkLocation(value: string): { ok: true; value: string } | { ok: false; error: string } {
  if (value.length > MAX_WORK_LOCATION_LENGTH + 100) {
    return { ok: false, error: `工作地點太長，請精簡至 ${MAX_WORK_LOCATION_LENGTH} 字以內。` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "請填寫工作地點。" };
  if (trimmed.length > MAX_WORK_LOCATION_LENGTH) {
    return { ok: false, error: `工作地點太長，請精簡至 ${MAX_WORK_LOCATION_LENGTH} 字以內。` };
  }
  return { ok: true, value: trimmed };
}

export function displayWorkLocation(location: string | null | undefined): string | null {
  if (location == null) return null;
  const trimmed = location.trim();
  return trimmed || null;
}
