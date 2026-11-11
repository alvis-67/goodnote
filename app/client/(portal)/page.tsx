import { ClientRequestList } from "@/components/client-request-list";
import { RememberClientList } from "@/components/remember-view";
import { listClientRequests } from "@/lib/data";
import { toCachedClientRequest } from "@/lib/view-cache";

export default async function ClientHomePage() {
  const requests = await listClientRequests();

  return (
    <main>
      <RememberClientList requests={requests.map((request) => toCachedClientRequest(request))} />
      <div>
        <h1 className="text-2xl font-semibold">我的請求</h1>
        <p className="mt-1 text-sm text-muted">報價、發票、收據和其他行政事項。完成後可按上方「登出」。</p>
      </div>
      <ClientRequestList requests={requests} />
    </main>
  );
}
