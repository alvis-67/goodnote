import { topicLabel, type TopicId } from "@/lib/domain";

/**
 * `topic` is the document the request started as, and it stays fixed.
 * The 事項 filter uses that topic. `stage` is the current step on the
 * same request. Issuing an invoice and confirming payment are separate
 * stages, so a quotation and a request that started as an invoice share
 * the invoice title.
 */
export type StageId = TopicId;

export const QUOTE_TITLE = "出報價單";
export const INVOICE_TITLE = "出發票";
export const RECEIPT_STAGE_TITLE = "已收錢，請出收據";
export const OTHER_TITLE = "其他";

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
  if ((topic === "quote" || topic === "invoice") && stage === "invoice") return INVOICE_TITLE;
  if ((topic === "quote" || topic === "invoice" || topic === "receipt") && stage === "receipt") {
    return RECEIPT_STAGE_TITLE;
  }
  if (topic === "other" && stage === "other") return OTHER_TITLE;
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
  return requestTitle(topic, next);
}

export function stageAdvanceNote(): string {
  return "訊息、檔案和工作地點會留在這則請求，不會另開一則。進入下一階段後，狀態會回到待處理。";
}

export function stageAdvancedNotice(): string {
  return "已進入下一階段。狀態已回到待處理。";
}

export function stageAdvanceError(): string {
  return "未能進入下一階段。";
}

function stageClientName(companyName: string): string {
  const name = companyName.trim();
  return name.length > 0 ? name : "這位客人";
}

/**
 * What the admin can issue at the current stage.
 * A quotation that has moved to the invoice stage asks for an invoice.
 * The receipt is mentioned only once the request is already at the paid-receipt stage.
 */
export function adminStagePrompt(companyName: string, topic: TopicId, stage: StageId): string | null {
  if (!isLegalStage(topic, stage)) return null;
  const name = stageClientName(companyName);
  if (stage === "quote") return `你可以為${name}出報價單。`;
  if (stage === "invoice") return `你可以為${name}出發票。`;
  if (stage === "receipt") return `你可以為${name}出收據。`;
  return null;
}
