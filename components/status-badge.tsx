import { statusLabel, type StatusId } from "@/lib/domain";

const styles: Record<StatusId, string> = {
  pending: "bg-pending-bg text-pending",
  recorded: "bg-recorded-bg text-recorded",
  completed: "bg-completed-bg text-completed",
};

export function StatusBadge({ status }: { status: StatusId }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium ${styles[status]}`}>
      {statusLabel(status)}
    </span>
  );
}
