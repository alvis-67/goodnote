import type { Metadata } from "next";

import { TelegramConnect } from "@/components/telegram-connect";
import { beginTelegramConnect, completeTelegramConnect, disconnectTelegram } from "@/lib/actions/admin";
import { loadTelegramSettings } from "@/lib/data";

export const metadata: Metadata = { title: "通知" };

export default async function TelegramPage() {
  const settings = await loadTelegramSettings();

  return (
    <main className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">通知</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        客戶成功建立新請求後，系統會發一則訊息到已連接的 Telegram。訊息包含客戶名稱、事項、工作地點、內容摘要，以及這個請求的管理頁連結。通知失敗不會阻止客戶送出請求。
      </p>
      <div className="mt-5 rounded-3xl bg-desk-card p-4">
        <TelegramConnect
          configured={settings.configured}
          connected={settings.connected}
          beginConnect={beginTelegramConnect}
          completeConnect={completeTelegramConnect}
          disconnect={disconnectTelegram}
        />
      </div>
    </main>
  );
}
