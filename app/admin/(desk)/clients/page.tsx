import type { Metadata } from "next";
import Link from "next/link";

import { ClientAccessForm } from "@/components/client-access-form";
import { listAdminClients } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "客戶" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const params = await searchParams;
  const clients = await listAdminClients();

  return (
    <main>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">客戶</h1>
          <p className="mt-1 text-sm leading-6 text-muted">
            為每位客戶設定獨一無二的登入名稱和密碼。電郵可以留空。客戶在客戶登入頁用登入名稱登入，不再使用連結。
          </p>
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
            const justCreated = params.created === client.id;
            return (
              <li key={client.id} className={`rounded-3xl bg-desk-card p-4 ${justCreated ? "ring-2 ring-stamp" : ""}`}>
                <div>
                  <h2 className="text-lg font-semibold">{client.company_name}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {[client.contact_name, client.phone].filter(Boolean).join(" · ") || "未有聯絡資料"}
                  </p>
                  <p className="mt-1 text-sm text-muted">建立於 {formatDateTime(client.created_at)}</p>
                  {client.login_name ? (
                    <p className="mt-2 text-sm">
                      登入名稱 <span className="font-semibold">{client.login_name}</span>
                      {client.email ? <span className="text-muted"> · {client.email}</span> : null}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-stamp">尚未設定登入，不能登入。</p>
                  )}
                </div>
                {client.notes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{client.notes}</p> : null}
                {justCreated && client.login_name ? (
                  <p className="mt-3 text-sm font-semibold text-stamp">
                    客戶已建立。登入名稱是 {client.login_name}。請把密碼私下告知他們，並請他們到客戶登入頁。
                  </p>
                ) : null}
                <ClientAccessForm clientId={client.id} loginName={client.login_name} email={client.email} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
