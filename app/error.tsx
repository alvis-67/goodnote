"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
      <h1 className="text-3xl font-semibold">暫時未能載入</h1>
      <p className="mt-3 leading-7 text-muted">請再試一次。如果問題持續，請檢查網絡或稍後回來。</p>
      <button type="button" onClick={reset} className="mt-6 min-h-12 rounded-2xl bg-navy px-5 font-semibold text-white">
        再試一次
      </button>
    </main>
  );
}
