import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TelegramConnect } from "../components/telegram-connect";
import { TOPICS, topicLabel } from "./domain";
import {
  connectFailure,
  createPairingCode,
  deliverNewRequestNotice,
  hashPairingCode,
  pairingMatch,
  postTelegram,
  sendTelegramText,
  telegramBotToken,
  type NewRequestNotice,
  type NoticeGateway,
} from "./telegram";
import {
  OFFICIAL_SITE_ORIGIN,
  TELEGRAM_PREVIEW_LENGTH,
  clientNoticeName,
  formatNewRequestMessage,
  isTelegramStartUrl,
  redactSecrets,
} from "./telegram-text";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function notice(overrides: Partial<NewRequestNotice> = {}): NewRequestNotice {
  return {
    requestId,
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clientId: "11111111-1111-4111-8111-111111111111",
    companyName: "甲工程公司",
    topic: "management",
    workLocation: "九龍灣地盤",
    body: "請處理搭棚申請",
    ...overrides,
  };
}

function gateway(overrides: Partial<NoticeGateway> = {}): NoticeGateway {
  return {
    token: null,
    loadChatId: async () => null,
    loadLoginName: async () => null,
    sendMessage: async () => ({ ok: true }),
    recordDelivery: async () => undefined,
    ...overrides,
  };
}

test("a new-request Telegram message names the client, topic, worksite, preview, and official admin page", () => {
  assert.equal("搵".codePointAt(0), 0x6435);
  assert.deepEqual(
    TOPICS.map((topic) => topic.label),
    ["出報價單", "出發票", "出收據", "搵管理處", "買保險", "其他"],
  );
  for (const topic of TOPICS) {
    assert.equal(topicLabel(topic.id), topic.label);
    if (topic.id === "management") assert.equal(topic.label.codePointAt(0), 0x6435);
  }

  const text = formatNewRequestMessage({
    companyName: " 甲工程公司 ",
    loginName: "acme",
    topic: "management",
    workLocation: " 九龍灣地盤 ",
    body: "請處理搭棚\n申請文件",
    requestId,
  });
  assert.match(text, /^新請求\n/);
  assert.match(text, /客戶：甲工程公司（acme）/);
  assert.match(text, /事項：搵管理處/);
  assert.equal(text.split("事項：")[1]?.codePointAt(0), 0x6435);
  assert.doesNotMatch(text, /揾管理處|找管理處/);
  assert.match(text, /工作地點：九龍灣地盤/);
  assert.match(text, /內容：請處理搭棚 申請文件/);
  assert.match(text, new RegExp(`${OFFICIAL_SITE_ORIGIN}/admin/requests/${requestId}$`));
  assert.equal(OFFICIAL_SITE_ORIGIN, "https://goodnote-kappa.vercel.app");
  assert.doesNotMatch(text, /localhost|goodquotation|goodquo/i);

  const sameName = formatNewRequestMessage({
    companyName: "acme",
    loginName: "acme",
    topic: "quote",
    workLocation: null,
    body: "   ",
    requestId,
  });
  assert.match(sameName, /客戶：acme\n/);
  assert.doesNotMatch(sameName, /（acme）/);
  assert.doesNotMatch(sameName, /工作地點/);
  assert.match(sameName, /事項：出報價單/);
  assert.match(sameName, /內容：（沒有文字）/);
  assert.equal(clientNoticeName("乙公司", null), "乙公司");

  const long = "燈".repeat(TELEGRAM_PREVIEW_LENGTH + 20);
  const preview = formatNewRequestMessage({
    companyName: "甲工程公司",
    loginName: null,
    topic: "other",
    workLocation: "   ",
    body: long,
    requestId,
  });
  assert.match(preview, new RegExp(`內容：${"燈".repeat(TELEGRAM_PREVIEW_LENGTH)}…`));
  assert.doesNotMatch(preview, new RegExp(`燈{${TELEGRAM_PREVIEW_LENGTH + 1}}`));
  assert.match(preview, /事項：其他/);
});

test("Telegram calls never return the bot token, and an unconfigured send is skipped", async () => {
  const secret = "C".repeat(32);
  const token = `100000:${secret}`;
  const leaked = new Error(`connect https://api.telegram.org/bot${token}/sendMessage`);
  const failed = await postTelegram(token, "sendMessage", { text: "hi" }, async () => {
    throw leaked;
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.detail.includes(secret), false);
    assert.equal(failed.detail.includes(token), false);
  }
  assert.equal(redactSecrets(`denied ${token}`).includes(secret), false);

  const refused = connectFailure(`Unauthorized ${token}`);
  assert.equal(refused.includes(secret), false);
  assert.match(refused, /TELEGRAM_BOT_TOKEN/);

  let called = false;
  const skipped = await deliverNewRequestNotice(
    notice(),
    gateway({
      sendMessage: async () => {
        called = true;
        return { ok: true };
      },
    }),
  );
  assert.deepEqual(skipped, { status: "skipped", reason: "not_configured" });
  assert.equal(called, false);

  const unconnected = await deliverNewRequestNotice(notice(), gateway({ token, loadChatId: async () => null }));
  assert.deepEqual(unconnected, { status: "skipped", reason: "not_connected" });

  const broken = await deliverNewRequestNotice(
    notice(),
    gateway({
      token,
      loadChatId: async () => {
        throw new Error(`telegram settings unavailable ${token}`);
      },
    }),
  );
  assert.equal(broken.status, "failed");
  if (broken.status === "failed") assert.equal(broken.detail.includes(secret), false);

  let recorded = false;
  let sentText = "";
  const sent = await deliverNewRequestNotice(
    notice(),
    gateway({
      token,
      loadChatId: async () => "7",
      loadLoginName: async () => "acme",
      sendMessage: async (_bot, _chat, text) => {
        sentText = text;
        return { ok: false, detail: `Bad Request ${token}` };
      },
      recordDelivery: async () => {
        recorded = true;
      },
    }),
  );
  assert.equal(sent.status, "failed");
  if (sent.status === "failed") assert.equal(sent.detail.includes(secret), false);
  assert.match(sentText, /事項：搵管理處/);
  assert.match(sentText, /客戶：甲工程公司（acme）/);
  assert.equal(recorded, false);

  const thrown = await deliverNewRequestNotice(
    notice(),
    gateway({
      token,
      loadChatId: async () => "7",
      sendMessage: async () => {
        throw new Error(token);
      },
    }),
  );
  assert.equal(thrown.status, "failed");
  if (thrown.status === "failed") assert.equal(thrown.detail.includes(secret), false);

  let logged = false;
  const delivered = await deliverNewRequestNotice(
    notice({ topic: "invoice", workLocation: null }),
    gateway({
      token,
      loadChatId: async () => "7",
      loadLoginName: async () => {
        throw new Error("login unavailable");
      },
      sendMessage: async () => ({ ok: true }),
      recordDelivery: async () => {
        logged = true;
        throw new Error("log failed");
      },
    }),
  );
  assert.deepEqual(delivered, { status: "sent" });
  assert.equal(logged, true);
});

test("sendMessage posts text without putting the token in the result", async () => {
  const secret = "E".repeat(32);
  const token = `100001:${secret}`;
  let path = "";
  let body = "";
  const result = await sendTelegramText(token, "7", "新請求\n事項：出收據", async (url, init) => {
    path = new URL(String(url)).pathname;
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  });
  assert.deepEqual(result, { ok: true });
  assert.match(path, /\/sendMessage$/);
  assert.equal(path.includes(secret), true);
  const payload = JSON.parse(body) as { chat_id: number; text: string; link_preview_options: { is_disabled: boolean } };
  assert.equal(payload.chat_id, 7);
  assert.match(payload.text, /出收據/);
  assert.equal(payload.link_preview_options.is_disabled, true);
  assert.equal(JSON.stringify(result).includes(secret), false);

  let fetched = false;
  const missing = await sendTelegramText(token, "0", "新請求", async () => {
    fetched = true;
    return new Response("{}", { status: 200 });
  });
  assert.equal(missing.ok, false);
  assert.equal(fetched, false);
});

test("Start from a private chat is the only pairing that is saved", () => {
  const code = createPairingCode();
  assert.match(code, /^[A-Za-z0-9_-]{16,64}$/);
  const url = `https://t.me/GoodnoteBot?start=${code}`;
  assert.equal(isTelegramStartUrl(url), true);
  assert.equal(isTelegramStartUrl("javascript:alert(1)"), false);
  const hash = hashPairingCode(code);
  const other = createPairingCode();
  const match = pairingMatch(
    [
      { update_id: 1, message: { text: `/start ${other}`, chat: { id: 8, type: "private" } } },
      { update_id: 2, message: { text: `/start ${code}`, chat: { id: 9, type: "group" } } },
      { update_id: 3, message: { text: `/start@GoodnoteBot ${code}`, chat: { id: "7", type: "private" } } },
      { update_id: 4, message: { text: "/start", chat: { id: 6, type: "private" } } },
    ],
    hash,
  );
  assert.deepEqual(match, { chatId: "7", updateId: 3 });
  assert.equal(pairingMatch([{ update_id: 5, message: { text: `/start ${code}`, chat: { id: 0, type: "private" } } }], hash), null);
  assert.equal(pairingMatch([], hashPairingCode(other)), null);
});

test("the bot token is read only from TELEGRAM_BOT_TOKEN and is not stored in the repo", () => {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.equal(telegramBotToken(), null);
    process.env.TELEGRAM_BOT_TOKEN = "replace-me";
    assert.equal(telegramBotToken(), null);
    const secret = "F".repeat(32);
    process.env.TELEGRAM_BOT_TOKEN = `100002:${secret}`;
    assert.equal(telegramBotToken(), `100002:${secret}`);
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previous;
  }

  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../db/migrations/0011_admin_telegram.sql", import.meta.url), "utf8");
  assert.match(example, /^TELEGRAM_BOT_TOKEN=$/m);
  assert.match(readme, /TELEGRAM_BOT_TOKEN/);
  assert.match(readme, /0011_admin_telegram\.sql/);
  assert.match(readme, /Goodnote Neon database only/);
  assert.match(migration, /DATABASE_URL_UNPOOLED/);
  assert.match(migration, /Goodnote Neon database only/);
  assert.match(migration, /create table public\.admin_telegram/);
  assert.match(migration, /channel in \('in_app', 'email', 'whatsapp', 'telegram'\)/);
  assert.match(migration, /insert into public\.admin_telegram \(id\) values \(1\)/);
  assert.doesNotMatch(migration, /update\s+(public\.)?requests\s+set\s+(topic|stage|status)/i);
  assert.doesNotMatch(migration, /neon_auth\./);
  assert.doesNotMatch(migration, /postgres:\/\//i);
  for (const file of [example, readme, migration]) {
    assert.doesNotMatch(file, /\d{5,}:[A-Za-z0-9_-]{20,}/);
  }
});

test("creating a request notifies after the message is saved and does not change topic, stage, or status", () => {
  const client = readFileSync(new URL("./actions/client.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("./actions/admin.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/admin/(desk)/telegram/page.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("../components/admin-header.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const savedAt = client.indexOf("if (!message.ok) return");
  const notifyAt = client.lastIndexOf("notifyAdminOfNewRequest");
  assert.ok(savedAt > -1);
  assert.ok(notifyAt > savedAt);
  assert.match(client, /after\(\(\) =>\s*notifyAdminOfNewRequest/);
  const notifyBlock = client.slice(notifyAt, client.indexOf("prepareUploads"));
  assert.doesNotMatch(notifyBlock, /set (topic|stage|status)|update requests/i);
  assert.doesNotMatch(clientPage, /補充或回覆|Composer|prepareClientReply/);

  const begin = admin.slice(admin.indexOf("export async function beginTelegramConnect"));
  assert.ok(begin.indexOf("await requireAdmin()") < begin.indexOf("startTelegramPairing()"));
  assert.ok(begin.indexOf("export async function completeTelegramConnect") < begin.indexOf("completeTelegramPairing()"));
  const complete = begin.slice(begin.indexOf("export async function completeTelegramConnect"));
  assert.ok(complete.indexOf("await requireAdmin()") < complete.indexOf("completeTelegramPairing()"));
  const disconnect = begin.slice(begin.indexOf("export async function disconnectTelegram"));
  assert.ok(disconnect.indexOf("await requireAdmin()") < disconnect.indexOf("clearTelegramChat()"));
  assert.match(page, /通知/);
  assert.match(page, /beginConnect=\{beginTelegramConnect\}/);
  assert.match(header, /href="\/admin\/telegram"/);
  assert.match(header, /通知/);
});

test("the notification page explains connect, disconnect, and a missing token", () => {
  const missing = renderToStaticMarkup(
    createElement(TelegramConnect, {
      configured: false,
      connected: false,
      beginConnect: async () => ({ ok: false as const, error: "不應呼叫" }),
      completeConnect: async () => ({ ok: false as const, error: "不應呼叫" }),
      disconnect: async () => ({ ok: false as const, error: "不應呼叫" }),
    }),
  );
  assert.match(missing, /TELEGRAM_BOT_TOKEN/);
  assert.match(missing, /客戶仍可正常送出/);
  assert.doesNotMatch(missing, /開始連接|解除連接/);

  const open = renderToStaticMarkup(
    createElement(TelegramConnect, {
      configured: true,
      connected: false,
      beginConnect: async () => ({ ok: true as const, url: "https://t.me/GoodnoteBot?start=abcdefghijklmnopqrst" }),
      completeConnect: async () => ({ ok: true as const }),
      disconnect: async () => ({ ok: true as const }),
    }),
  );
  assert.match(open, /按 Start/);
  assert.match(open, /開始連接/);
  assert.match(open, /完成連接/);
  assert.doesNotMatch(open, /href=/);

  const connected = renderToStaticMarkup(
    createElement(TelegramConnect, {
      configured: true,
      connected: true,
      beginConnect: async () => ({ ok: true as const, url: "https://t.me/GoodnoteBot?start=abcdefghijklmnopqrst" }),
      completeConnect: async () => ({ ok: true as const }),
      disconnect: async () => ({ ok: true as const }),
    }),
  );
  assert.match(connected, /已連接/);
  assert.match(connected, /解除連接/);
  assert.match(connected, /重新連接/);
  assert.doesNotMatch(connected, /TELEGRAM_BOT_TOKEN|chat_id|bot\d+:/);
});
