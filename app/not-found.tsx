import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
      <h1 className="text-3xl font-semibold">找不到頁面</h1>
      <p className="mt-3 text-muted">這條路徑不存在。</p>
      <Link href="/" className="mt-6 font-semibold text-navy">
        返回首頁
      </Link>
    </main>
  );
}
