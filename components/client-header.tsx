"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutClient } from "@/lib/actions/auth";
import { clientHomePath, clientNewPath } from "@/lib/paths";

export function ClientHeader({
  companyName,
  contactName,
  unread,
}: {
  companyName: string;
  contactName: string | null;
  unread: number;
}) {
  const pathname = usePathname();
  const onNew = pathname.endsWith("/new");
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <Link href={clientHomePath} className="text-xs font-semibold tracking-wide text-stamp">
            好事筆記
          </Link>
          <p className="truncate text-base font-semibold">{companyName}</p>
          {contactName ? <p className="truncate text-sm text-muted">{contactName}</p> : null}
          {unread > 0 ? <p className="text-sm font-semibold text-stamp">{unread} 個新回覆</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onNew ? (
            <Link href={clientHomePath} className="rounded-xl px-3 py-2 text-sm font-semibold text-navy">
              返回
            </Link>
          ) : (
            <Link href={clientNewPath} className="rounded-xl bg-stamp px-3 py-2 text-sm font-semibold text-white">
              新請求
            </Link>
          )}
          <form action={signOutClient}>
            <button type="submit" className="rounded-xl px-3 py-2 text-sm font-semibold text-navy">
              登出
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
