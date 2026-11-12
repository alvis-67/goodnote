const DIALABLE_PHONE = /^\+?[\d\s()./-]+$/;

/** Digits to dial. A leading + is kept so international numbers stay international. */
export function phoneCallHref(phone: string): string | null {
  const display = phone.trim();
  if (!DIALABLE_PHONE.test(display)) return null;
  const digits = display.replace(/\D/g, "");
  if (!digits) return null;
  return display.startsWith("+") ? `tel:+${digits}` : `tel:${digits}`;
}

/** The phone as the person should read and copy it. Null when it cannot be dialled. */
export function phoneCopyText(phone: string): string | null {
  const display = phone.trim();
  if (!display || !phoneCallHref(display)) return null;
  return display;
}

export async function copyPhoneNumber(
  phone: string,
  clipboard?: { writeText: (value: string) => Promise<void> },
): Promise<boolean> {
  const text = phoneCopyText(phone);
  if (!text) return false;
  const write = clipboard ? (value: string) => clipboard.writeText(value) : defaultClipboardWrite();
  if (write) {
    try {
      await write(text);
      return true;
    } catch {
      // The browser refused the clipboard. Try selecting the number instead.
    }
  }
  return copyWithSelection(text);
}

function defaultClipboardWrite(): ((value: string) => Promise<void>) | undefined {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return undefined;
  const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
  return (value) => writeText(value);
}

export type HongKongPhonePart = { type: "text"; text: string } | { type: "phone"; text: string };

/**
 * Split message text into plain words and Hong Kong phone numbers.
 * A number is eight digits in a row, or four and four with spaces or hyphens
 * (9123 4567, 9123-4567), plus an optional +852 or 852 prefix. Eight digits
 * inside a longer digit run stay plain text.
 */
export function splitHongKongPhoneText(input: string): HongKongPhonePart[] {
  const parts: HongKongPhonePart[] = [];
  const phraseRe = /\+(?:[ -]*\d)+|\d(?:[ -]*\d)*/g;
  let cursor = 0;
  for (const match of input.matchAll(phraseRe)) {
    const start = match.index ?? 0;
    const phrase = match[0];
    const phones = phoneRanges(phrase).filter((phone) => phoneCallHref(phrase.slice(phone.start, phone.end)));
    if (phones.length === 0) continue;
    pushText(parts, input.slice(cursor, start));
    let local = 0;
    for (const phone of phones) {
      pushText(parts, phrase.slice(local, phone.start));
      parts.push({ type: "phone", text: phrase.slice(phone.start, phone.end) });
      local = phone.end;
    }
    pushText(parts, phrase.slice(local));
    cursor = start + phrase.length;
  }
  pushText(parts, input.slice(cursor));
  return parts;
}

type PhoneRange = { start: number; end: number };
type DigitGroup = { start: number; end: number; digits: string };

function pushText(parts: HongKongPhonePart[], text: string) {
  if (!text) return;
  const last = parts.at(-1);
  if (last?.type === "text") {
    last.text += text;
    return;
  }
  parts.push({ type: "text", text });
}

function phoneRanges(phrase: string): PhoneRange[] {
  const parsed = parsePhonePhrase(phrase);
  const found = parsed ?? fallbackPhoneRanges(phrase);
  return found.toSorted((a, b) => a.start - b.start);
}

function parsePhonePhrase(phrase: string): PhoneRange[] | null {
  const plus = phrase.startsWith("+");
  const groups = digitGroups(phrase, plus ? 1 : 0);
  if (groups.length === 0) return null;
  const phones: PhoneRange[] = [];
  let index = 0;
  let plusUsed = false;
  while (index < groups.length) {
    const includePlus = plus && !plusUsed && index === 0;
    const prefixed = takePrefixed(groups, index, includePlus);
    if (prefixed) {
      phones.push(prefixed.range);
      index = prefixed.next;
      if (includePlus) plusUsed = true;
      continue;
    }
    if (plus && !plusUsed) return null;
    const local = takeLocal(groups, index);
    if (local) {
      phones.push(local.range);
      index = local.next;
      continue;
    }
    if (groups[index].digits.length > 8) {
      index += 1;
      continue;
    }
    return null;
  }
  return phones;
}

function digitGroups(phrase: string, from: number): DigitGroup[] {
  const groups: DigitGroup[] = [];
  let index = from;
  while (index < phrase.length) {
    while (index < phrase.length && isSeparator(phrase[index] ?? "")) index += 1;
    if (index >= phrase.length) break;
    const start = index;
    while (index < phrase.length && isDigit(phrase[index] ?? "")) index += 1;
    if (index === start) return [];
    groups.push({ start, end: index, digits: phrase.slice(start, index) });
  }
  return groups;
}

function takePrefixed(
  groups: DigitGroup[],
  index: number,
  includePlus: boolean,
): { range: PhoneRange; next: number } | null {
  const current = groups[index];
  if (!current) return null;
  if (current.digits.length === 11 && current.digits.startsWith("852")) {
    return { range: span(groups, index, index + 1, includePlus), next: index + 1 };
  }
  if (current.digits !== "852") return null;
  const next = takeLocalGroups(groups, index + 1);
  if (next === null) return null;
  return { range: span(groups, index, next, includePlus), next };
}

function takeLocal(groups: DigitGroup[], index: number): { range: PhoneRange; next: number } | null {
  const next = takeLocalGroups(groups, index);
  if (next === null) return null;
  return { range: span(groups, index, next, false), next };
}

/** Eight digits in a row, or the usual 4-4 split such as 9123 4567 / 9123-4567. */
function takeLocalGroups(groups: DigitGroup[], index: number): number | null {
  const first = groups[index];
  if (!first) return null;
  if (first.digits.length === 8) return index + 1;
  const second = groups[index + 1];
  if (first.digits.length === 4 && second?.digits.length === 4) return index + 2;
  return null;
}

function span(groups: DigitGroup[], from: number, to: number, includePlus: boolean): PhoneRange {
  const end = groups[to - 1]?.end ?? 0;
  return { start: includePlus ? 0 : (groups[from]?.start ?? 0), end };
}

function fallbackPhoneRanges(phrase: string): PhoneRange[] {
  if (phrase.includes("+") && !/^\+[ -]*852(?=[ -]*\d)/.test(phrase)) return [];
  const found: PhoneRange[] = [];
  const prefixed = /(?<![\d])(?:\+852\d{8}|852\d{8}|\+852[ -]+\d{8}|852[ -]+\d{8})(?![\d])/g;
  for (const match of phrase.matchAll(prefixed)) {
    const start = match.index ?? 0;
    found.push({ start, end: start + match[0].length });
  }
  const local = /(?<![\d+])\d{8}(?![\d])/g;
  for (const match of phrase.matchAll(local)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (found.some((phone) => start < phone.end && end > phone.start)) continue;
    found.push({ start, end });
  }
  return found;
}

function isDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

function isSeparator(character: string): boolean {
  return character === " " || character === "-";
}

function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
