import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { listClientRequests } from "@/lib/data";
import { topicLabel } from "@/lib/domain";
import { formatRelative } from "@/lib/format";
import { clientNewPath, clientRequestPath } from "@/lib/paths";

export default async function ClientHomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requests = await listClientRequests(token);

  return (
    <main>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">我的請求</h1>
          <p className="mt-1 text-sm text-muted">報價、發票、收據和其他行政事項。</p>
        </div>
      </div>
      {requests.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line bg-card px-5 py-8">
          <p className="text-base leading-7">尚未有任何請求。需要報價、發票或收據時，可以開一項新請求。</p>
          <Link href={clientNewPath(token)} className="mt-4 inline-flex min-h-11 items-center font-semibold text-stamp">
            開新請求
          </Link>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Link
                href={clientRequestPath(token, request.id)}
                className={`block rounded-3xl border bg-card px-4 py-4 ${
                  request.client_unread ? "border-stamp" : "border-line"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{topicLabel(request.topic)}</p>
                  <StatusBadge status={request.status} />
                </div>
                <p className="mt-2 text-sm text-muted">{formatRelative(request.last_activity_at)}</p>
                {request.client_unread ? <p className="mt-2 text-sm font-semibold text-stamp">新回覆</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
