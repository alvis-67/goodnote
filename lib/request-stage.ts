import { topicLabel, type TopicId } from "@/lib/domain";

/**
 * `topic` is the document the request started as, and it stays fixed.
 * `stage` is the current step on that same request. The visible title
 * depends on both, because a quotation asking for an invoice is not the
 * same wording as a request that started as an invoice.
 */
export type StageId = TopicId;

export const QUOTE_TITLE = "出報價單";
export const QUOTE_INVOICE_TITLE = "已出報價單，請出發票";
export const RECEIPT_STAGE_TITLE = "發票，已收錢，請出收據";

export function isStageId(value: string): value is StageId {
  return value === "quote" || value === "invoice" || value === "receipt" || value === "other";
}

export function isLegalStage(topic: TopicId, stage: StageId): boolean {
  if (topic === "quote") return stage === "quote" || stage === "invoice" || stage === "receipt";
  if (topic === "invoice") return stage === "invoice" || stage === "receipt";
  return stage === topic;
}

export function requestTitle(topic: TopicId, stage: StageId): string {
  if (topic === "quote" && stage === "quote") return QUOTE_TITLE;
  if (topic === "quote" && stage === "invoice") return QUOTE_INVOICE_TITLE;
  if ((topic === "quote" || topic === "invoice") && stage === "receipt") return RECEIPT_STAGE_TITLE;
  if (topic === "invoice" && stage === "invoice") return topicLabel("invoice");
  if (topic === "receipt") return topicLabel("receipt");
  if (topic === "other") return topicLabel("other");
  return topicLabel(topic);
}

/** One step forward. A quotation cannot skip the invoice stage. Nothing moves backward. */
export function nextRequestStage(topic: TopicId, stage: StageId): StageId | null {
  if (!isLegalStage(topic, stage)) return null;
  if (topic === "quote" && stage === "quote") return "invoice";
  if (topic === "quote" && stage === "invoice") return "receipt";
  if (topic === "invoice" && stage === "invoice") return "receipt";
  return null;
}

export function canAdvanceTo(topic: TopicId, stage: StageId, next: StageId): boolean {
  return nextRequestStage(topic, stage) === next;
}

export function stageChangeText(topic: TopicId, from: StageId, to: StageId): string {
  return `階段由${requestTitle(topic, from)}改為${requestTitle(topic, to)}`;
}

export function stageAdvanceLabel(topic: TopicId, stage: StageId): string | null {
  const next = nextRequestStage(topic, stage);
  if (!next) return null;
  return `改為${requestTitle(topic, next)}`;
}

export function stageAdvanceNote(): string {
  return "訊息、檔案和工作地點會留在這則請求，不會另開一則。進入下一階段後，狀態會回到待處理。";
}

export function stageAdvancedNotice(): string {
  return "已進入下一階段。狀態已回到待處理，並寫進時間線。";
}

export function stageAdvanceError(): string {
  return "未能進入下一階段。";
}

function stageClientName(companyName: string): string {
  const name = companyName.trim();
  return name.length > 0 ? name : "這位客人";
}

/** Standing admin prompt for the one allowed next stage. */
export function adminStagePrompt(companyName: string, topic: TopicId, stage: StageId): string | null {
  const next = nextRequestStage(topic, stage);
  if (!next) return null;
  return `你可以為${stageClientName(companyName)}改為「${requestTitle(topic, next)}」。`;
}
