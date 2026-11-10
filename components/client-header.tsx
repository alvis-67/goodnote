"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { clientHomePath, clientNewPath } from "@/lib/paths";

export function ClientHeader({
  token,
  companyName,
  contactName,
  unread,
}: {
  token: string;
  companyName: string;
  contactName: string | null;
  unread: number;
}) {
  const pathname = usePathname();
  const onNew = pathname.endsWith("/new");
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <Link href={clientHomePath(token)} className="text-xs font-semibold tracking-wide text-stamp">
            好事筆記
          </Link>
          <p className="truncate text-base font-semibold">{companyName}</p>
          {contactName ? <p className="truncate text-sm text-muted">{contactName}</p> : null}
          {unread > 0 ? <p className="text-sm font-semibold text-stamp">{unread} 個新回覆</p> : null}
        </div>
        {onNew ? (
          <Link href={clientHomePath(token)} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-navy">
            返回
          </Link>
        ) : (
          <Link href={clientNewPath(token)} className="shrink-0 rounded-xl bg-stamp px-3 py-2 text-sm font-semibold text-white">
            新請求
          </Link>
        )}
      </div>
    </header>
  );
}
