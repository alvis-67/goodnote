import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
      <h1 className="text-4xl font-semibold tracking-tight text-stamp">好事筆記</h1>
      <p className="mt-4 text-lg leading-8 text-muted">
        把報價、發票和收據的請求，從零散的 WhatsApp 訊息，收成一條可以回覆、也可以追蹤狀態的紀錄。
      </p>
      <ul className="mt-6 flex flex-col gap-2 text-base leading-7">
        <li>客戶用專屬連結進入，毋須註冊。</li>
        <li>每項請求都有自己的對話和檔案。</li>
        <li>狀態由待處理走到已入機，只有管理員可以更改。</li>
      </ul>
      <Link
        href="/admin/login"
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-2xl bg-navy px-5 font-semibold text-white"
      >
        管理員登入
      </Link>
      <p className="mt-8 text-sm text-muted">此系統只供已獲授權的客戶及管理員使用。</p>
    </main>
  );
}
