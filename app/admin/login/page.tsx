import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { SetupRequired } from "@/components/setup-required";
import { currentAdminEmail, isAllowlisted } from "@/lib/auth";
import { isDeskReady } from "@/lib/env";

export const metadata: Metadata = { title: "管理員登入" };

const errors: Record<string, string> = {
  link: "登入連結無效或已過期。",
  forbidden: "這個帳戶沒有管理員權限。",
  config: "系統尚未完成設定。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const params = await searchParams;
  if (!isDeskReady()) return <SetupRequired />;

  const email = await currentAdminEmail();
  if (email && (await isAllowlisted(email))) redirect("/admin");
  if (email) redirect("/auth/reject");

  const initialError = params.error ? errors[params.error] ?? "登入失敗，請再試一次。" : null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-16">
      <p className="text-sm font-semibold tracking-wide text-stamp">好事筆記</p>
      <h1 className="mt-3 text-3xl font-semibold">管理員登入</h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-muted">
        使用已獲授權的電郵接收登入連結或驗證碼。隨機註冊的帳戶不能進入管理區。
      </p>
      <LoginForm initialError={initialError} />
    </main>
  );
}
