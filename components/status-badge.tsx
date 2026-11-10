import { statusLabel, type StatusId } from "@/lib/domain";

const styles: Record<StatusId, string> = {
  pending: "bg-pending-bg text-pending",
  in_progress: "bg-progress-bg text-progress",
  issued: "bg-issued-bg text-issued",
  recorded: "bg-recorded-bg text-recorded",
};

export function StatusBadge({ status }: { status: StatusId }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium ${styles[status]}`}>
      {statusLabel(status)}
    </span>
  );
}
