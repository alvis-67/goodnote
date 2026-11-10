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

export type OpeningMessage = {
  id?: string;
  authorRole: string;
  kind: string;
  body: string | null;
  createdAt: string;
};

/**
 * The request content is the earliest non-empty client message.
 * Later replies, admin notes, and status lines are not copied.
 * A file-only request has no text body.
 */
export function openingClientContent(messages: readonly OpeningMessage[]): string {
  const candidates = messages.filter((message) => {
    if (message.kind !== "message" || message.authorRole !== "client") return false;
    return Boolean(message.body?.trim());
  });
  candidates.sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
    return (left.id ?? "").localeCompare(right.id ?? "");
  });
  return candidates[0]?.body?.trim() ?? "";
}

/** A new request or a reply needs text or a file. A follow-up does not. */
export function requestContentRequired(mode: "create" | "reply" | "follow"): boolean {
  return mode !== "follow";
}

export function followUpIntro(
  source: TopicId,
  next: TopicId,
  hasLocation: boolean,
  hasContent: boolean,
): string {
  const location = hasLocation
    ? "工作地點已從原本的請求填上，提交前仍可修改。"
    : "請填寫工作地點。";
  const content = hasContent
    ? "內容已從原本的請求填上，提交前仍可修改。"
    : "原本沒有文字內容，可以直接提交，不必再寫一次。";
  return `新的${topicLabel(next)}會連到這張${topicLabel(source)}。這張${topicLabel(source)}的事項、狀態、訊息和檔案維持不變。${location}${content}`;
}

export function followUpPlaceholder(next: TopicId): string {
  if (next === "invoice") return "例如：客人已同意，可以開工。";
  if (next === "receipt") return "例如：已收款，請開收據。";
  return "請寫下需要處理的內容。";
}

export function followUpEmptyPlaceholder(): string {
  return "可以留空，也可以補寫內容或附上檔案。";
}

function receiptClientName(companyName: string): string {
  const name = companyName.trim();
  return name.length > 0 ? name : "這位客人";
}

export function adminCanOpenReceipt(companyName: string): string {
  return `你可以為${receiptClientName(companyName)}開出收據。`;
}

export function adminReceiptAlreadyOpen(companyName: string): string {
  return `你可以查看已為${receiptClientName(companyName)}開出的收據。這張發票已有收據，不會再開一張。`;
}

export function adminReceiptCarryOver(): string {
  return "工作地點和內容會從這張發票帶過去。";
}
