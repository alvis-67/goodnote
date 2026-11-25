"use client";

import { useState } from "react";

import { isTelegramStartUrl, type TelegramLinkResult, type TelegramMutationResult } from "@/lib/telegram-text";

export function TelegramConnect({
  configured,
  connected,
  beginConnect,
  completeConnect,
  disconnect,
}: {
  configured: boolean;
  connected: boolean;
  beginConnect: () => Promise<TelegramLinkResult>;
  completeConnect: () => Promise<TelegramMutationResult>;
  disconnect: () => Promise<TelegramMutationResult>;
}) {
  const [isConnected, setConnected] = useState(connected);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const openUrl = url && isTelegramStartUrl(url) ? url : null;

  async function onBegin() {
    setBusy(true);
    setError(null);
    setConfirming(false);
    const result = await beginConnect();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUrl(result.url);
  }

  async function onComplete() {
    setBusy(true);
    setError(null);
    const result = await completeConnect();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConnected(true);
    setUrl(null);
  }

  async function onDisconnect() {
    setBusy(true);
    setError(null);
    const result = await disconnect();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConnected(false);
    setUrl(null);
    setConfirming(false);
  }

  if (!configured) {
    return (
      <p className="text-sm leading-6 text-muted">
        尚未設定 Telegram。請在伺服器設定 TELEGRAM_BOT_TOKEN。在此之前，新請求不會發 Telegram 訊息，客戶仍可正常送出。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isConnected ? (
        <p className="text-sm leading-6">已連接。之後的新請求會發到這個 Telegram 對話。</p>
      ) : (
        <p className="text-sm leading-6 text-muted">
          按「開始連接」，開啟機械人，然後按 Start。返回這一頁再按「完成連接」，這個對話就會收到新請求通知。
        </p>
      )}
      {openUrl ? (
        <p className="text-sm leading-6">
          已準備好。請開啟機械人並按 Start，然後按「完成連接」。連結約 10 分鐘內有效。
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {openUrl ? (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 text-sm font-semibold text-white"
          >
            開啟 Telegram
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => void onBegin()}
          disabled={busy}
          className="min-h-11 rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "請稍候…" : isConnected ? "重新連接" : "開始連接"}
        </button>
        {openUrl ? (
          <button
            type="button"
            onClick={() => void onComplete()}
            disabled={busy}
            className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-navy disabled:opacity-60"
          >
            完成連接
          </button>
        ) : null}
      </div>
      {isConnected && confirming ? (
        <div className="rounded-2xl bg-danger-bg p-3 text-sm leading-6">
          <p>確定要解除連接？之後的新請求不會再發到 Telegram，直到重新連接。</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void onDisconnect()}
              disabled={busy}
              className="min-h-11 rounded-xl bg-danger px-4 font-semibold text-white disabled:opacity-60"
            >
              確認解除
            </button>
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                setConfirming(false);
              }}
              disabled={busy}
              className="inline-flex min-h-11 items-center px-2 font-semibold text-navy disabled:opacity-60"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
      {isConnected && !confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="self-start text-sm font-semibold text-danger disabled:opacity-60"
        >
          解除連接
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
