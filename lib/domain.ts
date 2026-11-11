export const TOPICS = [
  { id: "quote", label: "出報價單", hint: "需要一份報價" },
  { id: "invoice", label: "出發票", hint: "需要開發票" },
  { id: "receipt", label: "出收據", hint: "需要開收據" },
  { id: "management", label: "搵管理處", hint: "需要搵管理處" },
  { id: "insurance", label: "買保險", hint: "需要買保險" },
  { id: "other", label: "其他", hint: "其他行政事項" },
] as const;

export const STATUSES = [
  { id: "pending", label: "待處理" },
  { id: "recorded", label: "已入機" },
  { id: "completed", label: "已完成" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export type StatusId = (typeof STATUSES)[number]["id"];

export const DELETE_CONFIRM_VALUE = "yes";

export function isTopicId(value: string): value is TopicId {
  return TOPICS.some((topic) => topic.id === value);
}

/** The 事項 filter matches the topic the request started as. An empty value means every topic. */
export function filterByTopic<T extends { topic: TopicId }>(rows: readonly T[], topic: string): readonly T[] {
  if (!isTopicId(topic)) return rows;
  return rows.filter((row) => row.topic === topic);
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

export function canAssignStatus(from: string, to: string): to is StatusId {
  return isStatusId(from) && isStatusId(to);
}

export function statusAssignments(): Array<[StatusId, StatusId]> {
  const pairs: Array<[StatusId, StatusId]> = [];
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      if (from.id !== to.id) pairs.push([from.id, to.id]);
    }
  }
  return pairs;
}

export function isDeleteConfirmed(value: unknown): boolean {
  return value === DELETE_CONFIRM_VALUE;
}
