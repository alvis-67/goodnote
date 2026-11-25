import { topicLabel, type TopicId } from "@/lib/domain";
import { displayWorkLocation } from "@/lib/work-location";

/** Admin links in Telegram always point at the official site. */
export const OFFICIAL_SITE_ORIGIN = "https://goodnote-kappa.vercel.app";

export const TELEGRAM_PREVIEW_LENGTH = 80;

const START_URL = /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\?start=[A-Za-z0-9_-]{16,64}$/;
const SECRET = /\d{5,}:[A-Za-z0-9_-]{10,}/g;

export function redactSecrets(value: string): string {
  return value.replace(SECRET, "[redacted]");
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function previewText(body: string): string {
  const flat = oneLine(body);
  if (flat.length <= TELEGRAM_PREVIEW_LENGTH) return flat;
  return `${flat.slice(0, TELEGRAM_PREVIEW_LENGTH)}…`;
}

export function clientNoticeName(companyName: string, loginName: string | null): string {
  const company = oneLine(companyName);
  const login = loginName ? oneLine(loginName) : "";
  if (company && login && company !== login) return `${company}（${login}）`;
  return company || login;
}

export function adminRequestUrl(requestId: string): string {
  return `${OFFICIAL_SITE_ORIGIN}/admin/requests/${requestId}`;
}

export function telegramStartUrl(username: string, code: string): string | null {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  return `https://t.me/${username}?start=${code}`;
}

export function isTelegramStartUrl(value: string): boolean {
  return START_URL.test(value);
}

export type TelegramLinkResult = { ok: true; url: string } | { ok: false; error: string };
export type TelegramMutationResult = { ok: true } | { ok: false; error: string };

export function formatNewRequestMessage(input: {
  companyName: string;
  loginName: string | null;
  topic: TopicId;
  workLocation: string | null;
  body: string;
  requestId: string;
}): string {
  const lines = [
    "新請求",
    `客戶：${clientNoticeName(input.companyName, input.loginName)}`,
    `事項：${topicLabel(input.topic)}`,
  ];
  const place = displayWorkLocation(input.workLocation);
  if (place) lines.push(`工作地點：${place}`);
  const preview = previewText(input.body);
  lines.push(preview ? `內容：${preview}` : "內容：（沒有文字）");
  lines.push(adminRequestUrl(input.requestId));
  return lines.join("\n");
}
