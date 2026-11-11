"use client";

import { usePathname } from "next/navigation";

import { InstantLink } from "@/components/instant-link";
import { SignOutForm } from "@/components/sign-out-form";
import { signOutAdmin } from "@/lib/actions/auth";

export function AdminHeader({ email, unread }: { email: string; unread: number }) {
  const pathname = usePathname();
  const desk = pathname === "/admin" || pathname.startsWith("/admin/requests");
  const clients = pathname.startsWith("/admin/clients");
  return (
    <header className="border-b border-navy/10 bg-navy text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <InstantLink href="/admin" className="mr-2 text-sm font-semibold tracking-wide">
          好事筆記 · 管理
        </InstantLink>
        <nav className="flex items-center gap-2 text-sm">
          <InstantLink
            href="/admin"
            ariaCurrent={desk ? "page" : undefined}
            className={`rounded-lg px-3 py-2 ${desk ? "bg-white text-navy" : "text-white/85"}`}
          >
            工作台
            {unread > 0 ? <span className="ml-2 rounded-full bg-stamp px-1.5 py-0.5 text-xs text-white">{unread}</span> : null}
          </InstantLink>
          <InstantLink
            href="/admin/clients"
            ariaCurrent={clients ? "page" : undefined}
            className={`rounded-lg px-3 py-2 ${clients ? "bg-white text-navy" : "text-white/85"}`}
          >
            客戶
          </InstantLink>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <p className="hidden max-w-48 truncate px-2 text-sm text-white/75 sm:block">{email}</p>
          <InstantLink href="/admin/password" className="rounded-lg px-3 py-2 text-sm font-semibold text-white">
            更改密碼
          </InstantLink>
          <SignOutForm action={signOutAdmin} buttonClassName="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" />
        </div>
      </div>
    </header>
  );
}
