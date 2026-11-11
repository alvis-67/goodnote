import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
      <h1 className="text-4xl font-semibold tracking-tight text-stamp">好事筆記</h1>
      <p className="mt-4 text-lg leading-8 text-muted">
        把報價、發票和收據的請求，從零散的 WhatsApp 訊息，收成一條可以回覆、也可以追蹤狀態的紀錄。
      </p>
      <ul className="mt-6 flex flex-col gap-2 text-base leading-7">
        <li>客戶用管理員設定的登入名稱和密碼登入。</li>
        <li>每項請求都有自己的對話和檔案。</li>
        <li>狀態有待處理、已入機和已完成，只有管理員可以更改。</li>
      </ul>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/client/login"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-stamp px-5 font-semibold text-white"
        >
          客戶登入
        </Link>
        <Link
          href="/admin/login"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-navy px-5 font-semibold text-white"
        >
          管理員登入
        </Link>
      </div>
      <p className="mt-8 text-sm text-muted">此系統只供已獲授權的客戶及管理員使用。登入後可在頁首按「登出」。</p>
    </main>
  );
}
