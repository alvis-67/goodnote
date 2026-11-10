import { topicLabel, type TopicId } from "@/lib/domain";

/** A request opened by the earlier linked-document design. New work does not create these. */
export type ChainLink = {
  id: string;
  topic: TopicId;
};

export function chainFromLabel(topic: TopicId): string {
  return `由${topicLabel(topic)}開出`;
}

export function chainOpenLabel(topic: TopicId): string {
  return `查看這張${topicLabel(topic)}`;
}

export function chainStartedLabel(topic: TopicId): string {
  return `已開${topicLabel(topic)}`;
}
