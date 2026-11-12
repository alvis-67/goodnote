import { topicLabel, type TopicId } from "@/lib/domain";
import { splitHongKongPhoneText } from "@/lib/phone";
import { displayWorkLocation } from "@/lib/work-location";

/**
 * Reads one pasted request. The original message is left untouched, and this
 * never creates a second request. Topic, stage, and a worksite the user
 * already saved stay as they are; callers only display what was read.
 */

export type ParsedPhone = {
  role: "contact" | "management";
  /** Digits as the person wrote them, including spaces and an 852 prefix. */
  text: string;
};

export type ParsedFax = {
  role: "management";
  text: string;
};

export type ParsedItem = {
  description: string;
  amount: number | null;
  /** True when several descriptions were written with only one amount. */
  shared: boolean;
};

export type ParsedRequestText = {
  topic: TopicId | null;
  topicConfidence: "clear" | "low";
  /** A clear reading, or a low-confidence 出報價單 when the topic was not written. */
  suggestion: TopicId | null;
  company: string | null;
  contact: string | null;
  phones: ParsedPhone[];
  faxes: ParsedFax[];
  worksite: string | null;
  deadline: string | null;
  matter: string | null;
  items: ParsedItem[];
  total: number | null;
  remarks: string | null;
};

export type ItemGroup = {
  descriptions: string[];
  amount: number | null;
  shared: boolean;
};

type TopicReading = Pick<ParsedRequestText, "topic" | "topicConfidence" | "suggestion">;
type LabelKind = "fax" | "management-phone" | "contact-phone" | "worksite" | "company" | "contact";

const MONEY = String.raw`(?:HK\s*)?[$＄]\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)`;
const ADDRESS_MARK = /(?:街|道|路|巷|里|\d+號|座|樓|室|層|中心|大廈|廣場|商場|苑|閣|邨|村|期|地盤|花園)/;
const DEADLINE_RE =
  /(?:今日|聽日|明天|後日|翌日|即日)(?:凌晨|早上|上午|中午|下午|晚上)?\s*\d{1,2}\s*點(?:半|\d{1,2}\s*分)?\s*前|(?:凌晨|早上|上午|中午|下午|晚上)\s*\d{1,2}\s*點(?:半|\d{1,2}\s*分)?\s*前/;
const COMPANY_SUFFIX = /(?:有限公司|股份有限公司|公司|(?:Limited|Ltd|Inc|Corp|Company|Co)\.?)/i;

export function parseRequestText(input: string): ParsedRequestText {
  const original = normalize(input);
  const result = emptyParsed();
  if (!original.trim()) return result;

  const reading = inferTopic(original);
  result.topic = reading.topic;
  result.topicConfidence = reading.topicConfidence;
  result.suggestion = reading.suggestion;

  const lines = joinCompanyLines(original.split("\n").map((line) => line.trim()));
  let remarksMode = false;
  const remarkLines: string[] = [];
  let pendingKind: LabelKind | null = null;
  const pendingItems: string[] = [];
  let expectTotal = false;

  const pushItem = (description: string, amount: number | null, shared: boolean) => {
    const cleaned = description.trim();
    if (!cleaned) return;
    result.items.push({ description: cleaned, amount, shared });
  };

  const flushPendingItems = () => {
    for (const description of pendingItems) {
      if (looksLikeWork(description)) pushItem(description, null, false);
    }
    pendingItems.length = 0;
  };

  const consumeLoneAmount = (amount: number) => {
    if (expectTotal) {
      flushPendingItems();
      if (result.total == null) result.total = amount;
      expectTotal = false;
      return;
    }
    if (pendingItems.length === 0) return;
    const shared = pendingItems.length > 1;
    for (const description of pendingItems) pushItem(description, amount, shared);
    pendingItems.length = 0;
  };

  for (const line of lines) {
    if (!line) continue;

    if (remarksMode) {
      remarkLines.push(line);
      continue;
    }

    const remarkStart = remarksStart(line);
    if (remarkStart) {
      flushPendingItems();
      remarksMode = true;
      if (remarkStart.body) remarkLines.push(remarkStart.body);
      continue;
    }

    if (pendingKind) {
      const taken = takePending(pendingKind, line, result);
      pendingKind = null;
      if (taken) continue;
    }

    if (isTopicLine(line)) continue;

    const label = matchLabel(line);
    if (label) {
      if (!label.value) {
        pendingKind = label.kind;
        continue;
      }
      if (label.kind === "fax" || label.kind === "management-phone" || label.kind === "contact-phone") {
        const phone = solePhone(label.value);
        if (phone) addNumber(result, label.kind, phone);
        continue;
      }
      if (label.kind === "worksite" && !result.worksite) result.worksite = label.value;
      if (label.kind === "company" && !result.company) result.company = label.value;
      if (label.kind === "contact" && !result.contact) result.contact = label.value;
      continue;
    }

    if (isTotalLabel(line)) {
      flushPendingItems();
      expectTotal = true;
      continue;
    }

    const total = parseTotal(line);
    if (total != null) {
      flushPendingItems();
      if (result.total == null) result.total = total;
      expectTotal = false;
      continue;
    }

    const inline = parseInlineItem(line);
    if (inline) {
      flushPendingItems();
      pushItem(inline.description, inline.amount, false);
      continue;
    }

    const lone = parseLoneAmount(line);
    if (lone != null) {
      consumeLoneAmount(lone);
      continue;
    }

    const split = splitCompanyAddress(line);
    if (split) {
      if (!result.company) result.company = split.company;
      if (!result.worksite) result.worksite = split.worksite;
      continue;
    }

    if (!result.contact && isContactLine(line)) {
      result.contact = line.trim();
      continue;
    }

    if (!result.company && isCompanyLine(line)) {
      result.company = stripTrailingDot(line.trim());
      continue;
    }

    if (!result.worksite && isAddressLine(line)) {
      result.worksite = line.trim();
      continue;
    }

    const deadline = deadlineIn(line);
    if (deadline && !result.deadline) result.deadline = deadline;
    if (isMatterLine(line)) {
      result.matter = result.matter ? `${result.matter}\n${line.trim()}` : line.trim();
      continue;
    }

    const found = hongKongPhones(line);
    if (found.length > 0 && !looksLikeWork(line)) {
      for (const phone of found) addNumber(result, "contact-phone", phone);
      continue;
    }

    if (isUntaggedNumber(line)) continue;

    pendingItems.push(line.trim());
  }

  flushPendingItems();
  const remarks = remarkLines.join("\n").trim();
  result.remarks = remarks || null;
  return result;
}

export function requestSourceText(
  messages: readonly { kind: string; author_role: string; body: string | null }[],
): string | null {
  for (const message of messages) {
    if (message.kind !== "message" || message.author_role !== "client") continue;
    if (!message.body?.trim()) continue;
    return message.body;
  }
  return null;
}

/** The saved worksite wins. A parsed address is only used when that field is empty. */
export function worksiteToShow(stored: string | null | undefined, parsed: string | null): string | null {
  return displayWorkLocation(stored) ?? (parsed?.trim() || null);
}

export function topicNote(
  parsed: ParsedRequestText,
  currentTopic: TopicId,
  audience: "admin" | "client",
): string | null {
  if (parsed.topicConfidence === "low") {
    if (!parsed.suggestion) return null;
    return `事項未明確，請人手選擇。僅供參考：${topicLabel(parsed.suggestion)}。`;
  }
  if (audience === "admin" && parsed.topic && parsed.topic !== currentTopic) {
    return `建議事項：${topicLabel(parsed.topic)}。目前事項是${topicLabel(currentTopic)}，系統不會自動更改事項或階段。`;
  }
  return null;
}

export function breakdownIsVisible(
  parsed: ParsedRequestText,
  currentTopic: TopicId,
  audience: "admin" | "client",
): boolean {
  if (topicNote(parsed, currentTopic, audience)) return true;
  return Boolean(
    parsed.company ||
      parsed.contact ||
      parsed.phones.length ||
      parsed.faxes.length ||
      parsed.worksite ||
      parsed.deadline ||
      parsed.matter ||
      parsed.items.length ||
      parsed.total != null ||
      parsed.remarks,
  );
}

export function itemGroups(items: readonly ParsedItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    if (!item) break;
    if (item.shared) {
      const descriptions = [item.description];
      const amount = item.amount;
      index += 1;
      while (index < items.length && items[index]?.shared && items[index]?.amount === amount) {
        descriptions.push(items[index]?.description ?? "");
        index += 1;
      }
      groups.push({ descriptions, amount, shared: true });
      continue;
    }
    groups.push({ descriptions: [item.description], amount: item.amount, shared: false });
    index += 1;
  }
  return groups;
}

export function formatParsedAmount(amount: number): string {
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `$${text}`;
}

function emptyParsed(): ParsedRequestText {
  return {
    topic: null,
    topicConfidence: "low",
    suggestion: null,
    company: null,
    contact: null,
    phones: [],
    faxes: [],
    worksite: null,
    deadline: null,
    matter: null,
    items: [],
    total: null,
    remarks: null,
  };
}

function normalize(input: string): string {
  return input.replace(/^\uFEFF/, "").replace(/\u3000/g, " ").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function inferTopic(input: string): TopicReading {
  const compact = stripRemarks(input).replace(/\s+/g, "");
  const explicit = earliestTopic([
    { at: searchIndex(compact, /出報價單|報價單|出報價/), topic: "quote" },
    { at: searchIndex(compact, /出收據|請出收據|已收錢|已收妥|已付款/), topic: "receipt" },
    { at: searchIndex(compact, /出發票|開發票|出單收錢|出單收款/), topic: "invoice" },
  ]);
  if (explicit) return clearTopic(explicit);
  if (/收錢/.test(compact) && !/已收錢/.test(compact)) return clearTopic("invoice");
  if (isManagementWork(input)) return clearTopic("management");
  if (/買保險|購買保險|投保/.test(compact)) return clearTopic("insurance");
  return { topic: null, topicConfidence: "low", suggestion: "quote" };
}

function clearTopic(topic: TopicId): TopicReading {
  return { topic, topicConfidence: "clear", suggestion: topic };
}

function earliestTopic(candidates: Array<{ at: number; topic: TopicId }>): TopicId | null {
  let best: { at: number; topic: TopicId } | null = null;
  for (const candidate of candidates) {
    if (candidate.at < 0) continue;
    if (!best || candidate.at < best.at) best = candidate;
  }
  return best?.topic ?? null;
}

function searchIndex(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  return match?.index ?? -1;
}

function stripRemarks(input: string): string {
  const kept: string[] = [];
  for (const line of normalize(input).split("\n")) {
    if (/^\s*(?:備註加條款|備註及條款|備註|備注|條款)(?:\s|$|[:：])/.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n");
}

function isManagementWork(text: string): boolean {
  const compact = stripRemarks(text).replace(/\s+/g, "");
  if (/搵管理處|找管理處|聯絡管理處/.test(compact)) return true;
  if (/申請文件/.test(compact)) return true;
  if (/管理處/.test(compact) && /傳真|電話|Fax|FAX|fax|申請|文件/.test(stripRemarks(text))) return true;
  if (/(?:俾|比|向|到)管理處/.test(compact)) return true;
  return false;
}

function joinCompanyLines(lines: readonly string[]): string[] {
  const joined: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1];
    if (next != null && isCompanyBreak(line, next)) {
      joined.push(`${line}${next}`);
      index += 1;
      continue;
    }
    joined.push(line);
  }
  return joined;
}

function isCompanyBreak(line: string, next: string): boolean {
  if (!line || !next) return false;
  if (/\d/.test(line) || /[$＄]/.test(line) || /[$＄]/.test(next)) return false;
  if (/[。！？!?，,：:]$/.test(line)) return false;
  if (!/^[\u4e00-\u9fff]{1,8}公司$/.test(next)) return false;
  if (/公司$/.test(line)) return false;
  if (!/^[\u4e00-\u9fff]{2,40}$/.test(line)) return false;
  if (isContactLine(line) || isAddressLine(line) || isTopicLine(line)) return false;
  return true;
}

function isTopicLine(line: string): boolean {
  const compact = line.replace(/[\s，,。！!、：:]/g, "");
  if (!compact || compact.length > 24) return false;
  return /^(?:出報價單比我|請出報價單|麻煩出報價單|出報價單|出報價|報價單|出單收錢|出單收款|出發票|開發票|請出發票|出收據|請出收據|已收錢請出收據|已收錢|收錢|去收錢|要收錢|請收錢|麻煩收錢|搵管理處|找管理處|買保險|購買保險|請買保險)$/.test(
    compact,
  );
}

function matchLabel(line: string): { kind: LabelKind; value: string } | null {
  const labeled: Array<{ kind: LabelKind; re: RegExp }> = [
    { kind: "fax", re: /^(?:管理處\s*傳真|傳真號碼)\s*[:：]?\s*(.*)$/ },
    { kind: "management-phone", re: /^(?:管理處\s*電話)\s*[:：]?\s*(.*)$/ },
    { kind: "fax", re: /^(?:傳真|Fax|FAX)\s*[:：]\s*(.*)$/ },
    { kind: "contact-phone", re: /^(?:聯絡電話|手提電話|手機|電話)\s*[:：]?\s*(.*)$/ },
    { kind: "worksite", re: /^(?:工作地點|單位|地址|地盤|地點)\s*[:：]\s*(.*)$/ },
    { kind: "company", re: /^(?:公司名稱|公司)\s*[:：]\s*(.*)$/ },
    { kind: "contact", re: /^(?:聯絡人|聯繫人)\s*[:：]\s*(.*)$/ },
  ];
  for (const pattern of labeled) {
    const match = pattern.re.exec(line);
    if (!match) continue;
    return { kind: pattern.kind, value: (match[1] ?? "").trim() };
  }
  return null;
}

function takePending(kind: LabelKind, line: string, result: ParsedRequestText): boolean {
  if (kind === "fax" || kind === "management-phone" || kind === "contact-phone") {
    const phone = barePhone(line);
    if (!phone) return false;
    addNumber(result, kind, phone);
    return true;
  }
  const value = line.trim();
  if (!value) return false;
  if (kind === "worksite" && !result.worksite) result.worksite = value;
  if (kind === "company" && !result.company) result.company = stripTrailingDot(value);
  if (kind === "contact" && !result.contact) result.contact = value;
  return true;
}

function addNumber(result: ParsedRequestText, kind: "fax" | "management-phone" | "contact-phone", text: string) {
  if (kind === "fax") {
    if (!result.faxes.some((fax) => fax.text === text)) result.faxes.push({ role: "management", text });
    return;
  }
  const role = kind === "management-phone" ? "management" : "contact";
  if (!result.phones.some((phone) => phone.role === role && phone.text === text)) {
    result.phones.push({ role, text });
  }
}

function remarksStart(line: string): { body: string } | null {
  if (parseInlineItem(line) || parseTotal(line) != null) return null;
  const match = /^(?:備註加條款|備註及條款|備註|備注|條款)\s*[:：]?\s*(.*)$/.exec(line);
  if (!match) return null;
  return { body: (match[1] ?? "").trim() };
}

function isTotalLabel(line: string): boolean {
  return /^(?:總數|總計|合計|合共|總額|總共)\s*[:：]?\s*$/.test(line);
}

function parseTotal(line: string): number | null {
  const match = /^(?:總數|總計|合計|合共|總額|總共)\s*[:：]?\s*(?:(?:HK\s*)?[$＄]\s*)?(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*$/i.exec(
    line,
  );
  if (!match?.[1]) return null;
  return parseAmount(match[1]);
}

function parseInlineItem(line: string): { description: string; amount: number } | null {
  const match = new RegExp(`^(.+?)\\s*${MONEY}\\s*$`, "i").exec(line);
  if (!match?.[1] || !match[2]) return null;
  const description = match[1].trim().replace(/[:：]$/, "").trim();
  if (!description || /^(?:總數|總計|合計|合共|總額|總共)$/.test(description)) return null;
  const amount = parseAmount(match[2]);
  if (amount == null) return null;
  return { description, amount };
}

function parseLoneAmount(line: string): number | null {
  const match = new RegExp(`^${MONEY}\\s*$`, "i").exec(line);
  if (!match?.[1]) return null;
  return parseAmount(match[1]);
}

function parseAmount(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return value;
}

function splitCompanyAddress(line: string): { company: string; worksite: string } | null {
  const match = new RegExp(`^(.+?${COMPANY_SUFFIX.source})[.．。]?\\s+(\\S.*)$`, "i").exec(line);
  if (!match?.[1] || !match[2]) return null;
  const worksite = match[2].trim();
  if (!isAddressLine(worksite)) return null;
  return { company: stripTrailingDot(match[1].trim()), worksite };
}

function isCompanyLine(line: string): boolean {
  const value = stripTrailingDot(line.trim());
  if (!value || /[$＄]/.test(value) || isContactLine(value)) return false;
  return /(?:有限公司|股份有限公司|公司)$/.test(value) || /(?:^|\s)(?:Limited|Ltd|Inc|Corp|Company|Co)\.?$/i.test(value);
}

function isContactLine(line: string): boolean {
  const value = line.trim();
  if (/^[\u4e00-\u9fff]{1,4}(?:先生|小姐|女士|太太)$/.test(value)) return true;
  if (/^[\u4e00-\u9fff]{1,3}生$/.test(value)) return true;
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(value);
}

function isAddressLine(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 80) return false;
  if (/[$＄]/.test(value) || isContactLine(value) || isCompanyLine(value) || barePhone(value)) return false;
  return ADDRESS_MARK.test(value);
}

function isMatterLine(line: string): boolean {
  if (isTopicLine(line) || parseInlineItem(line) || parseLoneAmount(line) != null) return false;
  if (/^(?:麻煩|請你|請幫|幫我|處理|申請|安排|通知)/.test(line)) return true;
  return /申請文件|(?:俾|比|向)管理處|Fax資料|傳真資料/.test(line);
}

function looksLikeWork(line: string): boolean {
  return /棚|喉|冷氣|維修|更換|加名|呎|工料|包料|隔氣|水電|油漆|泥水|搭棚|拆棚/.test(line);
}

function deadlineIn(line: string): string | null {
  return DEADLINE_RE.exec(line)?.[0]?.replace(/\s+/g, "") ?? null;
}

function hongKongPhones(text: string): string[] {
  return splitHongKongPhoneText(text)
    .filter((part) => part.type === "phone")
    .map((part) => part.text);
}

function solePhone(text: string): string | null {
  const phones = hongKongPhones(text);
  if (phones.length !== 1) return null;
  const rest = phones.reduce((value, phone) => value.replace(phone, ""), text);
  if (/\d/.test(rest)) return null;
  return phones[0] ?? null;
}

function barePhone(line: string): string | null {
  const phone = solePhone(line);
  if (!phone) return null;
  const rest = line.replace(phone, "").replace(/[\s()（）._\-。，,：:]/g, "");
  return rest === "" ? phone : null;
}

function isUntaggedNumber(line: string): boolean {
  const trimmed = line.trim();
  if (!/^[\d\s+-]+$/.test(trimmed)) return false;
  return hongKongPhones(trimmed).length === 0;
}

function stripTrailingDot(value: string): string {
  return value.replace(/[.．。]+$/, "");
}
