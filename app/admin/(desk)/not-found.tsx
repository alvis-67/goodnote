import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">找不到這個請求</h1>
      <Link href="/admin" className="mt-4 inline-flex font-semibold text-navy">
        返回工作台
      </Link>
    </main>
  );
}
