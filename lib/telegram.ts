import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { TopicId } from "@/lib/domain";
import {
  formatNewRequestMessage,
  isTelegramStartUrl,
  previewText,
  redactSecrets,
  telegramStartUrl,
} from "@/lib/telegram-text";

const TOKEN = /^\d+:[A-Za-z0-9_-]{20,128}$/;
const METHOD = /^[A-Za-z]+$/;
const CODE = /^[A-Za-z0-9_-]{16,64}$/;
const CODE_HASH = /^[0-9a-f]{64}$/;
const CHAT_ID = /^[1-9][0-9]{0,14}$/;

export type TelegramCall = { ok: true; result: unknown } | { ok: false; detail: string };

export function telegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (!TOKEN.test(token)) return null;
  return token;
}

export function createPairingCode(): string {
  return randomBytes(16).toString("base64url");
}

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function pairingCodesMatch(leftHash: string, rightHash: string): boolean {
  if (!CODE_HASH.test(leftHash) || !CODE_HASH.test(rightHash)) return false;
  return timingSafeEqual(Buffer.from(leftHash, "utf8"), Buffer.from(rightHash, "utf8"));
}

export function readBotUsername(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const username = (result as { username?: unknown }).username;
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
  return username;
}

export function buildStartLink(result: unknown, code: string): string | null {
  const username = readBotUsername(result);
  if (!username) return null;
  const url = telegramStartUrl(username, code);
  if (!url || !isTelegramStartUrl(url)) return null;
  return url;
}

function startPayload(text: string): string | null {
  const match = /^\/start(?:@[A-Za-z0-9_]{5,32})?(?:\s+(\S+))?$/.exec(text.trim());
  return match?.[1] ?? null;
}

function normalizeChatId(value: unknown): string | null {
  const text =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!CHAT_ID.test(text)) return null;
  return text;
}

export function pairingMatch(
  updates: unknown,
  codeHash: string,
): { chatId: string; updateId: number } | null {
  if (!CODE_HASH.test(codeHash) || !Array.isArray(updates)) return null;
  let found: { chatId: string; updateId: number } | null = null;
  for (const update of updates) {
    if (!update || typeof update !== "object") continue;
    const updateId = (update as { update_id?: unknown }).update_id;
    if (typeof updateId !== "number" || !Number.isSafeInteger(updateId) || updateId < 0) continue;
    const message = (update as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    const chat = (message as { chat?: unknown }).chat;
    const text = (message as { text?: unknown }).text;
    if (typeof text !== "string" || !chat || typeof chat !== "object") continue;
    if ((chat as { type?: unknown }).type !== "private") continue;
    const payload = startPayload(text);
    if (!payload || !CODE.test(payload)) continue;
    if (!pairingCodesMatch(hashPairingCode(payload), codeHash)) continue;
    const chatId = normalizeChatId((chat as { id?: unknown }).id);
    if (!chatId) continue;
    found = { chatId, updateId };
  }
  return found;
}

function telegramMethodUrl(token: string, method: string): string {
  if (!TOKEN.test(token) || !METHOD.test(method)) throw new Error("telegram request failed");
  return `https://api.telegram.org/bot${token}/${method}`;
}

function readDescription(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const description = (data as { description?: unknown }).description;
  return typeof description === "string" ? description.slice(0, 300) : "";
}

export async function postTelegram(
  token: string,
  method: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramCall> {
  let url: string;
  try {
    url = telegramMethodUrl(token, method);
  } catch {
    return { ok: false, detail: "telegram request failed" };
  }
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, detail: `telegram http ${response.status}` };
    }
    if (!response.ok || !data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
      const description = redactSecrets(readDescription(data));
      return { ok: false, detail: description || `telegram http ${response.status}` };
    }
    return { ok: true, result: (data as { result: unknown }).result };
  } catch {
    return { ok: false, detail: "telegram request failed" };
  }
}

export async function sendTelegramText(
  token: string,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (!CHAT_ID.test(chatId)) return { ok: false, detail: "telegram chat missing" };
  const sent = await postTelegram(
    token,
    "sendMessage",
    {
      chat_id: Number(chatId),
      text,
      link_preview_options: { is_disabled: true },
    },
    fetchImpl,
  );
  if (!sent.ok) return sent;
  return { ok: true };
}

export type NewRequestNotice = {
  requestId: string;
  messageId: string;
  clientId: string;
  companyName: string;
  topic: TopicId;
  workLocation: string | null;
  body: string;
};

export type NoticeGateway = {
  token: string | null;
  loadChatId: () => Promise<string | null>;
  loadLoginName: (clientId: string) => Promise<string | null>;
  sendMessage: (
    token: string,
    chatId: string,
    text: string,
  ) => Promise<{ ok: true } | { ok: false; detail: string }>;
  recordDelivery: (notice: NewRequestNotice, excerpt: string) => Promise<void>;
};

export type NoticeResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "not_configured" | "not_connected" }
  | { status: "failed"; detail: string };

export async function deliverNewRequestNotice(
  notice: NewRequestNotice,
  gateway: NoticeGateway,
): Promise<NoticeResult> {
  if (!gateway.token) return { status: "skipped", reason: "not_configured" };
  let chatId: string | null;
  try {
    chatId = await gateway.loadChatId();
  } catch (error) {
    return {
      status: "failed",
      detail: redactSecrets(error instanceof Error ? error.message : "telegram settings unavailable"),
    };
  }
  if (!chatId) return { status: "skipped", reason: "not_connected" };

  let loginName: string | null = null;
  try {
    loginName = await gateway.loadLoginName(notice.clientId);
  } catch {
    loginName = null;
  }

  const text = formatNewRequestMessage({
    companyName: notice.companyName,
    loginName,
    topic: notice.topic,
    workLocation: notice.workLocation,
    body: notice.body,
    requestId: notice.requestId,
  });
  let sent: { ok: true } | { ok: false; detail: string };
  try {
    sent = await gateway.sendMessage(gateway.token, chatId, text);
  } catch (error) {
    return {
      status: "failed",
      detail: redactSecrets(error instanceof Error ? error.message : "telegram send failed"),
    };
  }
  if (!sent.ok) return { status: "failed", detail: redactSecrets(sent.detail) };
  try {
    await gateway.recordDelivery(notice, previewText(notice.body));
  } catch (error) {
    console.error("telegram delivery log failed", redactSecrets(error instanceof Error ? error.name : "error"));
  }
  return { status: "sent" };
}

export function connectFailure(detail: string): string {
  const safe = redactSecrets(detail);
  if (/webhook/i.test(safe)) return "機械人已設定 webhook，暫時未能在這裡讀取 Start。";
  if (/unauthorized/i.test(safe) || /\b401\b/.test(safe)) return "Telegram 拒絕了這個機械人。請檢查 TELEGRAM_BOT_TOKEN。";
  return "未能讀取 Start。";
}
