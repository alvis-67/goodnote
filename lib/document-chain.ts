import { topicLabel, type TopicId } from "@/lib/domain";

export type ChainLink = {
  id: string;
  topic: TopicId;
};

/** Quotation to invoice, then invoice to receipt. No other step. */
export function nextDocumentTopic(topic: TopicId): TopicId | null {
  if (topic === "quote") return "invoice";
  if (topic === "invoice") return "receipt";
  return null;
}

export function canFollowDocument(parent: TopicId, child: TopicId): boolean {
  return nextDocumentTopic(parent) === child;
}

export function chainFromLabel(topic: TopicId): string {
  return `由${topicLabel(topic)}開出`;
}

export function chainOpenLabel(topic: TopicId): string {
  return `查看這張${topicLabel(topic)}`;
}

export function chainStartedLabel(topic: TopicId): string {
  return `已開${topicLabel(topic)}`;
}

export function chainStartLabel(topic: TopicId): string {
  return `開${topicLabel(topic)}`;
}

export function chainMissingLabel(topic: TopicId): string {
  return `尚未開${topicLabel(topic)}`;
}

export function chainDuplicateError(topic: TopicId): string {
  return `已經有${topicLabel(topic)}，不會再開一張。`;
}

export function followUpIntro(source: TopicId, next: TopicId, hasLocation: boolean): string {
  const location = hasLocation
    ? "工作地點已從原本的請求填上，提交前仍可修改。"
    : "請填寫工作地點。";
  return `新的${topicLabel(next)}會連到這張${topicLabel(source)}。這張${topicLabel(source)}的事項、狀態、訊息和檔案維持不變。${location}請寫下內容，也可以附上檔案。`;
}

export function followUpPlaceholder(next: TopicId): string {
  if (next === "invoice") return "例如：客人已同意，可以開工。";
  if (next === "receipt") return "例如：已收款，請開收據。";
  return "請寫下需要處理的內容。";
}
