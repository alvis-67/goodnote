"use client";

import { usePathname } from "next/navigation";

import { ClientListLink } from "@/components/client-list-link";
import { signOutClient } from "@/lib/actions/auth";
import { clientListHref, showNewRequest } from "@/lib/client-nav";
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
  const showList = clientListHref(pathname) !== null;
  const showNew = showNewRequest(pathname);
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper">
      <div className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <a href={clientHomePath} className="text-xs font-semibold tracking-wide text-stamp">
            好事筆記
          </a>
          <p className="truncate text-base font-semibold">{companyName}</p>
          {contactName ? <p className="truncate text-sm text-muted">{contactName}</p> : null}
          {unread > 0 ? <p className="text-sm font-semibold text-stamp">{unread} 個新回覆</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {showList ? (
            <ClientListLink className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-navy" />
          ) : null}
          {showNew ? (
            <a
              href={clientNewPath}
              className="inline-flex min-h-11 items-center rounded-xl bg-stamp px-3 py-2 text-sm font-semibold text-white"
            >
              新請求
            </a>
          ) : null}
          <form action={signOutClient}>
            <button type="submit" className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-navy">
              登出
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
