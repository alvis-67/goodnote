export function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
      <p className="text-sm font-semibold tracking-wide text-stamp">好事筆記</p>
      <h1 className="mt-3 text-3xl font-semibold">尚未完成設定</h1>
      <p className="mt-3 text-base leading-7 text-muted">
        系統還沒有連上 Supabase。請依照 README 設定環境變數，然後重新啟動。
      </p>
    </main>
  );
}
