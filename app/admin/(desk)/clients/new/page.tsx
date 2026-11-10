import type { Metadata } from "next";
import Link from "next/link";

import { ClientForm } from "@/components/client-form";

export const metadata: Metadata = { title: "新增客戶" };

export default function NewClientPage() {
  return (
    <main className="mx-auto max-w-xl">
      <Link href="/admin/clients" className="text-sm font-semibold text-navy">
        返回客戶
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">新增客戶</h1>
      <p className="mt-2 text-sm leading-6 text-muted">至少填寫公司名稱。建立後會產生一條不能猜測的連結。</p>
      <div className="mt-5 rounded-3xl bg-desk-card p-4">
        <ClientForm />
      </div>
    </main>
  );
}
