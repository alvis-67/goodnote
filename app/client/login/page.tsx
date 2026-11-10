import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { SetupRequired } from "@/components/setup-required";
import { loginClient } from "@/lib/actions/auth";
import { readSession } from "@/lib/auth/session";
import { isDeskReady } from "@/lib/env";

export const metadata: Metadata = { title: "客戶登入" };

export default async function ClientLoginPage() {
  await connection();
  if (!isDeskReady()) return <SetupRequired />;
  const session = await readSession();
  if (session?.kind === "client") redirect("/client");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-16">
      <p className="text-sm font-semibold tracking-wide text-stamp">好事筆記</p>
      <h1 className="mt-3 text-3xl font-semibold">客戶登入</h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-muted">
        使用管理員設定的登入名稱和密碼。登入名稱不必是電郵。登入後會保持登入，直至你按「登出」，或管理員重設密碼。
      </p>
      <LoginForm action={loginClient} field="loginName" initialError={null} />
      <p className="mt-6 text-sm text-muted">
        管理員請到{" "}
        <Link href="/admin/login" className="font-semibold text-navy">
          管理員登入
        </Link>
        。
      </p>
    </main>
  );
}
