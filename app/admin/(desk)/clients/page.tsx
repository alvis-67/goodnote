import type { Metadata } from "next";
import Link from "next/link";

import { CopyLink } from "@/components/copy-link";
import { listAdminClients } from "@/lib/data";
import { clientUrl, requestOrigin } from "@/lib/origin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "客戶" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const params = await searchParams;
  const [clients, origin] = await Promise.all([listAdminClients(), requestOrigin()]);

  return (
    <main>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">客戶</h1>
          <p className="mt-1 text-sm text-muted">把專屬連結發給客戶。連結就是他們的入場證，請不要公開張貼。</p>
        </div>
        <Link href="/admin/clients/new" className="rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white">
          新增客戶
        </Link>
      </div>
      {clients.length === 0 ? (
        <p className="mt-8 rounded-3xl bg-desk-card px-5 py-8 text-muted">尚未有客戶。</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {clients.map((client) => {
            const url = clientUrl(origin, client.access_token);
            const justCreated = params.created === client.id;
            return (
              <li key={client.id} className={`rounded-3xl bg-desk-card p-4 ${justCreated ? "ring-2 ring-stamp" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">{client.company_name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {[client.contact_name, client.phone].filter(Boolean).join(" · ") || "未有聯絡資料"}
                    </p>
                    <p className="mt-1 text-sm text-muted">建立於 {formatDateTime(client.created_at)}</p>
                  </div>
                  <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-navy">
                    以客戶身份查看
                  </a>
                </div>
                {client.notes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{client.notes}</p> : null}
                {justCreated ? <p className="mt-3 text-sm font-semibold text-stamp">客戶已建立。請複製連結並發給他們。</p> : null}
                <div className="mt-3">
                  <CopyLink url={url} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
