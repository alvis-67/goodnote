import "server-only";

import { dbErrorCode, sql } from "@/lib/db";
import { asText } from "@/lib/rows";
import {
  buildStartLink,
  connectFailure,
  createPairingCode,
  deliverNewRequestNotice,
  hashPairingCode,
  pairingMatch,
  postTelegram,
  sendTelegramText,
  telegramBotToken,
  type NewRequestNotice,
} from "@/lib/telegram";
import { redactSecrets, type TelegramLinkResult, type TelegramMutationResult } from "@/lib/telegram-text";
import { isUuid } from "@/lib/tokens";

async function loadConnectedChatId(): Promise<string | null> {
  try {
    const rows = await sql()`
      select chat_id
      from admin_telegram
      where id = 1
        and chat_id is not null
      limit 1
    `;
    const chatId = asText(rows[0]?.chat_id)?.trim() ?? "";
    if (!/^[1-9][0-9]{0,14}$/.test(chatId)) return null;
    return chatId;
  } catch (error) {
    throw new Error(`telegram settings unavailable ${dbErrorCode(error)}`.trim());
  }
}

async function loadClientLoginName(clientId: string): Promise<string | null> {
  if (!isUuid(clientId)) return null;
  const rows = await sql()`
    select login_name
    from clients
    where id = ${clientId}
    limit 1
  `;
  return asText(rows[0]?.login_name);
}

async function recordTelegramDelivery(notice: NewRequestNotice, excerpt: string): Promise<void> {
  if (!isUuid(notice.requestId) || !isUuid(notice.messageId) || !isUuid(notice.clientId)) return;
  try {
    await sql()`
      insert into notification_events (
        event_type,
        channel,
        recipient_role,
        client_id,
        request_id,
        message_id,
        payload,
        delivered_at
      ) values (
        'request_created',
        'telegram',
        'admin',
        ${notice.clientId},
        ${notice.requestId},
        ${notice.messageId},
        jsonb_build_object(
          'topic', ${notice.topic},
          'company_name', ${notice.companyName},
          'excerpt', ${excerpt}
        ),
        now()
      )
    `;
  } catch (error) {
    console.error("telegram delivery log failed", dbErrorCode(error));
  }
}

export async function notifyAdminOfNewRequest(notice: NewRequestNotice): Promise<void> {
  try {
    const result = await deliverNewRequestNotice(notice, {
      token: telegramBotToken(),
      loadChatId: loadConnectedChatId,
      loadLoginName: loadClientLoginName,
      sendMessage: (token, chatId, text) => sendTelegramText(token, chatId, text),
      recordDelivery: recordTelegramDelivery,
    });
    if (result.status === "skipped" && result.reason === "not_configured") {
      console.error("telegram not configured");
    } else if (result.status === "skipped") {
      console.info("telegram chat not connected");
    } else if (result.status === "failed") {
      console.error("telegram notify failed", result.detail);
    }
  } catch (error) {
    console.error("telegram notify failed", redactSecrets(error instanceof Error ? error.name : "error"));
  }
}

export async function startTelegramPairing(): Promise<TelegramLinkResult> {
  const token = telegramBotToken();
  if (!token) return { ok: false, error: "系統尚未設定 Telegram。" };
  const me = await postTelegram(token, "getMe", {});
  if (!me.ok) return { ok: false, error: "未能讀取機械人。請檢查 TELEGRAM_BOT_TOKEN。" };
  const code = createPairingCode();
  const url = buildStartLink(me.result, code);
  if (!url) return { ok: false, error: "未能開始連接。" };
  try {
    const rows = await sql()`
      update admin_telegram
      set pairing_code_hash = ${hashPairingCode(code)},
          pairing_expires_at = now() + interval '10 minutes',
          updated_at = now()
      where id = 1
      returning id
    `;
    if (!rows[0]) return { ok: false, error: "尚未完成資料庫設定。" };
  } catch (error) {
    console.error("telegram pairing save failed", dbErrorCode(error));
    return { ok: false, error: "未能開始連接。" };
  }
  return { ok: true, url };
}

export async function completeTelegramPairing(): Promise<TelegramMutationResult> {
  const token = telegramBotToken();
  if (!token) return { ok: false, error: "系統尚未設定 Telegram。" };
  let hash = "";
  try {
    const rows = await sql()`
      select pairing_code_hash
      from admin_telegram
      where id = 1
        and pairing_expires_at > now()
      limit 1
    `;
    hash = asText(rows[0]?.pairing_code_hash) ?? "";
  } catch (error) {
    console.error("telegram pairing read failed", dbErrorCode(error));
    return { ok: false, error: "未能完成連接。" };
  }
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return { ok: false, error: "請先按「開始連接」，開啟機械人並按 Start。" };
  }
  const updates = await postTelegram(token, "getUpdates", {
    timeout: 0,
    limit: 100,
    allowed_updates: ["message"],
  });
  if (!updates.ok) {
    console.error("telegram updates failed", redactSecrets(updates.detail));
    return { ok: false, error: connectFailure(updates.detail) };
  }
  const match = pairingMatch(updates.result, hash);
  if (!match) return { ok: false, error: "尚未收到 Start。請開啟機械人並按 Start，然後再試一次。" };
  try {
    const rows = await sql()`
      update admin_telegram
      set chat_id = ${match.chatId},
          connected_at = now(),
          pairing_code_hash = null,
          pairing_expires_at = null,
          updated_at = now()
      where id = 1
        and pairing_code_hash = ${hash}
        and pairing_expires_at > now()
      returning id
    `;
    if (!rows[0]) return { ok: false, error: "連接已過時，請再開始。" };
  } catch (error) {
    console.error("telegram chat save failed", dbErrorCode(error));
    return { ok: false, error: "未能儲存連接。" };
  }
  return { ok: true };
}

export async function clearTelegramChat(): Promise<TelegramMutationResult> {
  try {
    const rows = await sql()`
      update admin_telegram
      set chat_id = null,
          connected_at = null,
          pairing_code_hash = null,
          pairing_expires_at = null,
          updated_at = now()
      where id = 1
      returning id
    `;
    if (!rows[0]) return { ok: false, error: "尚未完成資料庫設定。" };
  } catch (error) {
    console.error("telegram disconnect failed", dbErrorCode(error));
    return { ok: false, error: "未能解除連接。" };
  }
  return { ok: true };
}
