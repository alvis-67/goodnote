import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { SetupRequired } from "@/components/setup-required";
import { loginAdmin } from "@/lib/actions/auth";
import { readSession } from "@/lib/auth/session";
import { isDeskReady } from "@/lib/env";

export const metadata: Metadata = { title: "管理員登入" };

const notices: Record<string, string> = {
  password: "密碼已更新。請重新登入。這個帳戶在其他裝置上的登入亦已結束。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await connection();
  const params = await searchParams;
  if (!isDeskReady()) return <SetupRequired />;

  const session = await readSession();
  if (session?.kind === "admin") redirect("/admin");

  const initialNotice = params.notice ? (notices[params.notice] ?? null) : null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-16">
      <p className="text-sm font-semibold tracking-wide text-stamp">好事筆記</p>
      <h1 className="mt-3 text-3xl font-semibold">管理員登入</h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-muted">
        使用允許清單上的電郵和密碼。尚未設定密碼的帳戶不能登入，亦沒有公開註冊。登入後會保持登入，直至你按「登出」，或更改密碼。
      </p>
      <LoginForm action={loginAdmin} field="email" initialError={params.error ? "登入失敗，請再試一次。" : null} initialNotice={initialNotice} />
      <p className="mt-6 text-sm text-muted">
        客戶請到{" "}
        <Link href="/client/login" className="font-semibold text-navy">
          客戶登入
        </Link>
        。
      </p>
    </main>
  );
}
