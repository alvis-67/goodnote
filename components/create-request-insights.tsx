import { RequestBreakdown } from "@/components/request-breakdown";
import { breakdownIsVisible, parseRequestText, type ParsedRequestText } from "@/lib/request-text";
import {
  classifyTopicWithRules,
  topicChoicePrompt,
  topicChoiceStatus,
  type TopicPhraseRule,
} from "@/lib/topic-rules";
import type { TopicId } from "@/lib/domain";

export function CreateRequestInsights({
  body,
  rules,
  topic,
}: {
  body: string;
  rules: readonly TopicPhraseRule[];
  topic: TopicId | null;
}) {
  if (!body.trim()) return null;
  const match = classifyTopicWithRules(body, rules);
  const parsed = draftParsed(body, match);
  const prompt = topicChoicePrompt(body, match, topic);
  const status = topicChoiceStatus(match, topic);
  const currentTopic = topic ?? match ?? "other";
  const showBreakdown = breakdownIsVisible(parsed, currentTopic, "client");
  if (!showBreakdown && !prompt && !status) return null;

  return (
    <div aria-live="polite">
      {status ? <p className="text-sm leading-6 text-muted">{status}</p> : null}
      {prompt ? (
        <p role="status" className="rounded-2xl bg-pending-bg px-3 py-3 text-sm leading-6 text-pending">
          {prompt}
        </p>
      ) : null}
      {showBreakdown ? (
        <RequestBreakdown parsed={parsed} currentTopic={currentTopic} audience="client" />
      ) : null}
    </div>
  );
}

function draftParsed(body: string, match: TopicId | null): ParsedRequestText {
  const extracted = parseRequestText(body);
  return {
    ...extracted,
    topic: match,
    topicConfidence: match ? "clear" : "low",
    suggestion: null,
  };
}
