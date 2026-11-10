import type { Metadata } from "next";
import Link from "next/link";

import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = { title: "更改密碼" };

export default function AdminPasswordPage() {
  return (
    <main className="mx-auto max-w-xl">
      <Link href="/admin" className="text-sm font-semibold text-navy">
        返回工作台
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">更改密碼</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        更改後，這個帳戶在所有裝置上的登入都會結束，包括現在這一次。你需要用新密碼重新登入。頁首的「登出」只會結束這部裝置的登入。
      </p>
      <div className="mt-5 rounded-3xl bg-desk-card p-4">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
