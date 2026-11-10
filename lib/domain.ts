export const TOPICS = [
  { id: "quote", label: "出報價單", hint: "需要一份報價" },
  { id: "invoice", label: "出發票", hint: "需要開發票" },
  { id: "receipt", label: "出收據", hint: "需要開收據" },
  { id: "other", label: "其他", hint: "其他行政事項" },
] as const;

export const STATUSES = [
  { id: "pending", label: "待處理" },
  { id: "in_progress", label: "處理中" },
  { id: "issued", label: "已出單" },
  { id: "recorded", label: "已入機" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export type StatusId = (typeof STATUSES)[number]["id"];

const STATUS_ORDER: StatusId[] = ["pending", "in_progress", "issued", "recorded"];

export function isTopicId(value: string): value is TopicId {
  return TOPICS.some((topic) => topic.id === value);
}

export function isStatusId(value: string): value is StatusId {
  return STATUSES.some((status) => status.id === value);
}

export function topicLabel(id: TopicId): string {
  return TOPICS.find((topic) => topic.id === id)?.label ?? id;
}

export function statusLabel(id: StatusId): string {
  return STATUSES.find((status) => status.id === id)?.label ?? id;
}

export function nextStatus(current: StatusId): StatusId | null {
  const index = STATUS_ORDER.indexOf(current);
  if (index < 0 || index >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[index + 1] ?? null;
}

export function statusTransitions(): Array<[StatusId, StatusId]> {
  const pairs: Array<[StatusId, StatusId]> = [];
  for (let index = 0; index < STATUS_ORDER.length - 1; index += 1) {
    const from = STATUS_ORDER[index];
    const to = STATUS_ORDER[index + 1];
    if (from && to) pairs.push([from, to]);
  }
  return pairs;
}

export function statusChangeText(from: StatusId, to: StatusId): string {
  return `狀態由${statusLabel(from)}改為${statusLabel(to)}`;
}

export function advanceLabel(next: StatusId): string {
  if (next === "in_progress") return "開始處理";
  if (next === "issued") return "標記為已出單";
  if (next === "recorded") return "標記為已入機";
  return `標記為${statusLabel(next)}`;
}
