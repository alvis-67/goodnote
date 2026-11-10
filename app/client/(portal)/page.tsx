import { ClientRequestList } from "@/components/client-request-list";
import { listClientRequests } from "@/lib/data";

export default async function ClientHomePage() {
  const requests = await listClientRequests();

  return (
    <main>
      <div>
        <h1 className="text-2xl font-semibold">我的請求</h1>
        <p className="mt-1 text-sm text-muted">報價、發票、收據和其他行政事項。完成後可按上方「登出」。</p>
      </div>
      <ClientRequestList requests={requests} />
    </main>
  );
}
