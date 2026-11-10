import { ClientListLink } from "@/components/client-list-link";
import { StatusBadge } from "@/components/status-badge";
import { WorkLocation } from "@/components/work-location";
import type { StatusId, TopicId } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { requestTitle, type StageId } from "@/lib/request-stage";

export function ClientRequestHeading({
  topic,
  stage,
  status,
  createdAt,
  location,
}: {
  topic: TopicId;
  stage: StageId;
  status: StatusId;
  createdAt: string;
  location: string | null;
}) {
  return (
    <div>
      <ClientListLink />
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{requestTitle(topic, stage)}</h1>
          <WorkLocation location={location} />
          <p className="mt-1 text-sm text-muted">建立於 {formatDateTime(createdAt)}</p>
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
