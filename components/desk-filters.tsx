"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { STATUSES, TOPICS } from "@/lib/domain";
import { adminDeskHref } from "@/lib/paths";

export function DeskFilters({
  status,
  topic,
  clientId,
  clients,
  currentHref,
}: {
  status?: string;
  topic?: string;
  clientId?: string;
  clients: { id: string; company_name: string }[];
  currentHref: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const pending = target !== null && target !== currentHref;

  return (
    <form
      key={currentHref}
      className="mt-5 grid gap-3 rounded-3xl border border-navy/10 bg-desk-card p-4 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const href = adminDeskHref({
          status: String(data.get("status") ?? ""),
          topic: String(data.get("topic") ?? ""),
          clientId: String(data.get("client") ?? ""),
        });
        if (href === currentHref) return;
        setTarget(href);
        router.push(href);
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        狀態
        <select name="status" defaultValue={status ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 font-normal">
          <option value="">全部</option>
          {STATUSES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        事項
        <select name="topic" defaultValue={topic ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 font-normal">
          <option value="">全部</option>
          {TOPICS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        客戶
        <select name="client" defaultValue={clientId ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 font-normal">
          <option value="">全部</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.company_name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-navy px-4 font-semibold text-white disabled:opacity-60">
          {pending ? "正在篩選…" : "篩選"}
        </button>
        <Link href="/admin" className="pb-2 text-sm font-semibold text-navy">
          清除
        </Link>
      </div>
    </form>
  );
}
