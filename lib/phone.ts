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
