import { isTopicId, topicLabel, type TopicId } from "@/lib/domain";
import { isManagementOfficeRequest, topicSearchText } from "@/lib/request-text";

/** Phrases are short. A whole pasted request is not a rule. */
export const MAX_TOPIC_RULE_PHRASE_LENGTH = 80;

/** Wait this long after the last keystroke before reading the content again. A paste does not wait. */
export const TOPIC_CLASSIFY_PAUSE_MS = 300;

export const TOPIC_CHOICE_PROMPT = "未能從內容判斷事項，請選擇事項。";

/**
 * Standing phrases shipped with the app. A longer phrase wins over a shorter
 * one, so 已收錢 stays 出收據 and is not read as 收錢. The admin can add or
 * delete rows later; these are only the starting list.
 */
export const DEFAULT_TOPIC_RULES: readonly TopicPhraseRule[] = [
  { phrase: "出報價單", topic: "quote" },
  { phrase: "報價單", topic: "quote" },
  { phrase: "出報價", topic: "quote" },
  { phrase: "出收據", topic: "receipt" },
  { phrase: "請出收據", topic: "receipt" },
  { phrase: "已收錢", topic: "receipt" },
  { phrase: "已收妥", topic: "receipt" },
  { phrase: "已付款", topic: "receipt" },
  { phrase: "出發票", topic: "invoice" },
  { phrase: "開發票", topic: "invoice" },
  { phrase: "出單收錢", topic: "invoice" },
  { phrase: "出單收款", topic: "invoice" },
  { phrase: "收錢", topic: "invoice" },
  { phrase: "搵管理處", topic: "management" },
  { phrase: "找管理處", topic: "management" },
  { phrase: "聯絡管理處", topic: "management" },
  { phrase: "買保險", topic: "insurance" },
  { phrase: "購買保險", topic: "insurance" },
  { phrase: "投保", topic: "insurance" },
];

export type TopicPhraseRule = {
  phrase: string;
  topic: TopicId;
};

export type TopicRuleRecord = TopicPhraseRule & {
  id: string;
};

export type SaveTopicRuleResult = { ok: true; rule: TopicRuleRecord } | { ok: false; error: string };

export type DeleteTopicRuleResult = { ok: true } | { ok: false; error: string };

export type TopicSelection = {
  /** Topic shown on the new-request form. Null means the client still has to choose. */
  topic: TopicId | null;
  /** The topic the client picked themselves. */
  manual: TopicId | null;
  /** The last clear phrase match seen for this draft. */
  matched: TopicId | null;
};

/** Clients receive the phrase and topic only. */
export function topicPhrasesForClient(rules: readonly TopicRuleRecord[]): TopicPhraseRule[] {
  return rules.map((rule) => ({ phrase: rule.phrase, topic: rule.topic }));
}

/**
 * One topic for the whole paste. Longer phrases win. 收錢 inside 已收錢 does
 * not count as the shorter phrase. Remarks are already removed. When no
 * phrase matches, office wording still means 搵管理處. Otherwise nothing is
 * chosen: 出報價單 is not a guess.
 */
export function classifyTopicWithRules(input: string, rules: readonly TopicPhraseRule[]): TopicId | null {
  const compact = topicSearchText(input);
  if (!compact) return null;

  let best: { topic: TopicId; length: number; at: number } | null = null;
  for (const rule of rules) {
    if (!isTopicId(rule.topic)) continue;
    const phrase = rule.phrase.replace(/\s+/g, "");
    if (!phrase) continue;
    const at = phraseAt(compact, phrase);
    if (at < 0) continue;
    if (!best || phrase.length > best.length || (phrase.length === best.length && at < best.at)) {
      best = { topic: rule.topic, length: phrase.length, at };
    }
  }
  if (best) return best.topic;
  if (isManagementOfficeRequest(input)) return "management";
  return null;
}

export function classifySchedule(reason: "input" | "paste"): { delay: number } {
  return { delay: reason === "paste" ? 0 : TOPIC_CLASSIFY_PAUSE_MS };
}

export function initialTopicSelection(): TopicSelection {
  return { topic: null, manual: null, matched: null };
}

export function selectTopicManually(topic: TopicId, observedMatch: TopicId | null): TopicSelection {
  return { topic, manual: topic, matched: observedMatch };
}

/**
 * A clear match selects that topic. A match that changes to a different topic
 * replaces a topic the client picked earlier. The same match does not override
 * them again, and a later miss does not clear their choice or fall back to 出報價單.
 */
export function topicSelectionAfterMatch(state: TopicSelection, match: TopicId | null): TopicSelection {
  if (match) {
    if (state.manual && state.matched === match) return state;
    if (state.manual && match !== state.manual && state.matched !== match) {
      return { topic: match, manual: null, matched: match };
    }
    if (!state.manual) return { topic: match, manual: null, matched: match };
    return { ...state, matched: match };
  }
  if (state.manual) return { topic: state.manual, manual: state.manual, matched: null };
  return initialTopicSelection();
}

export function topicChoicePrompt(body: string, match: TopicId | null, topic: TopicId | null): string | null {
  if (!body.trim() || match || topic) return null;
  return TOPIC_CHOICE_PROMPT;
}

export function topicChoiceStatus(match: TopicId | null, topic: TopicId | null): string | null {
  if (!match || topic !== match) return null;
  return `已按內容選擇${topicLabel(match)}。`;
}

/** A typed worksite stays. An empty field takes the parsed address, and an untouched field follows the parse. */
export function nextWorksiteValue(current: string, parsed: string | null, edited: boolean): string {
  if (edited && current.trim()) return current;
  return parsed?.trim() ?? "";
}

export function parseTopicRuleDraft(
  phraseInput: string,
  topicInput: string,
): { ok: true; phrase: string; topic: TopicId } | { ok: false; error: string } {
  const phrase = phraseInput.trim();
  if (!phrase) return { ok: false, error: "請填寫字句。" };
  if (phrase.length > MAX_TOPIC_RULE_PHRASE_LENGTH) {
    return { ok: false, error: `字句太長，請精簡至 ${MAX_TOPIC_RULE_PHRASE_LENGTH} 字以內。` };
  }
  if (/[\r\n]/.test(phrase)) return { ok: false, error: "字句不能分行。" };
  if (!isTopicId(topicInput)) return { ok: false, error: "請選擇事項。" };
  return { ok: true, phrase, topic: topicInput };
}

export function rulesAfterSave(current: readonly TopicRuleRecord[], saved: TopicRuleRecord): TopicRuleRecord[] {
  const index = current.findIndex((item) => item.id === saved.id || item.phrase === saved.phrase);
  if (index < 0) return [...current, saved];
  return current.map((item, itemIndex) => (itemIndex === index ? saved : item));
}

export function rulesAfterDelete(current: readonly TopicRuleRecord[], id: string): TopicRuleRecord[] {
  return current.filter((item) => item.id !== id);
}

export async function commitNewTopicRule(
  phrase: string,
  topic: string,
  current: readonly TopicRuleRecord[],
  save: (phrase: string, topic: string) => Promise<SaveTopicRuleResult>,
): Promise<{ ok: true; rules: TopicRuleRecord[] } | { ok: false; error: string }> {
  const parsed = parseTopicRuleDraft(phrase, topic);
  if (!parsed.ok) return parsed;
  const saved = await save(parsed.phrase, parsed.topic);
  if (!saved.ok) return saved;
  return { ok: true, rules: rulesAfterSave(current, saved.rule) };
}

export async function commitDeleteTopicRule(
  id: string,
  current: readonly TopicRuleRecord[],
  remove: (id: string) => Promise<DeleteTopicRuleResult>,
): Promise<{ ok: true; rules: TopicRuleRecord[] } | { ok: false; error: string }> {
  if (!current.some((item) => item.id === id)) return { ok: false, error: "這個規則不能刪除。" };
  const removed = await remove(id);
  if (!removed.ok) return removed;
  return { ok: true, rules: rulesAfterDelete(current, id) };
}

function phraseAt(compact: string, phrase: string): number {
  let from = 0;
  while (from < compact.length) {
    const at = compact.indexOf(phrase, from);
    if (at < 0) return -1;
    if (phrase === "收錢" && at > 0 && compact.startsWith("已收錢", at - 1)) {
      from = at + phrase.length;
      continue;
    }
    return at;
  }
  return -1;
}
