import { StatusBadge } from "@/components/status-badge";
import { WorkLocation } from "@/components/work-location";
import type { RequestRow } from "@/lib/database.types";
import { topicLabel } from "@/lib/domain";
import { formatRelative } from "@/lib/format";
import { clientNewPath, clientRequestPath } from "@/lib/paths";

export function ClientRequestList({ requests }: { requests: RequestRow[] }) {
  if (requests.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-line bg-card px-5 py-8">
        <p className="text-base leading-7">尚未有任何請求。需要報價、發票或收據時，可以開一項新請求。</p>
        <a href={clientNewPath} className="mt-4 inline-flex min-h-11 items-center font-semibold text-stamp">
          開新請求
        </a>
      </div>
    );
  }

  return (
    <ul className="mt-5 flex flex-col gap-3">
      {requests.map((request) => (
        <li key={request.id}>
          <a
            href={clientRequestPath(request.id)}
            className={`block rounded-3xl border bg-card px-4 py-4 ${
              request.client_unread ? "border-stamp" : "border-line"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{topicLabel(request.topic)}</p>
              <StatusBadge status={request.status} />
            </div>
            <WorkLocation location={request.work_location} />
            <p className="mt-2 text-sm text-muted">{formatRelative(request.last_activity_at)}</p>
            {request.client_unread ? <p className="mt-2 text-sm font-semibold text-stamp">新回覆</p> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
