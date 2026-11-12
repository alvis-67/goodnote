import type { ReactNode } from "react";

import { NumberActions } from "@/components/number-actions";
import type { TopicId } from "@/lib/domain";
import {
  breakdownIsVisible,
  formatParsedAmount,
  itemGroups,
  topicNote,
  type ParsedRequestText,
} from "@/lib/request-text";

export function RequestBreakdown({
  parsed,
  currentTopic,
  audience,
}: {
  parsed: ParsedRequestText;
  currentTopic: TopicId;
  audience: "admin" | "client";
}) {
  if (!breakdownIsVisible(parsed, currentTopic, audience)) return null;
  const note = topicNote(parsed, currentTopic, audience);
  const contactPhones = parsed.phones.filter((phone) => phone.role === "contact");
  const officePhones = parsed.phones.filter((phone) => phone.role === "management");
  const groups = itemGroups(parsed.items);
  const cardClass =
    audience === "admin"
      ? "mt-5 rounded-3xl bg-desk-card p-4"
      : "mt-5 rounded-3xl border border-line bg-card p-4";

  return (
    <section aria-label="內容摘要" className={cardClass}>
      <h2 className="text-base font-semibold">內容摘要</h2>
      {note ? (
        <p
          className={
            parsed.topicConfidence === "low"
              ? "mt-3 rounded-2xl bg-pending-bg px-3 py-3 text-sm leading-6 text-pending"
              : "mt-3 rounded-2xl bg-white px-3 py-3 text-sm leading-6 text-navy"
          }
        >
          {note}
        </p>
      ) : null}
      <dl className="mt-3 flex flex-col gap-3 text-sm leading-6">
        {parsed.company ? <Field label="公司">{parsed.company}</Field> : null}
        {parsed.contact ? <Field label="聯絡人">{parsed.contact}</Field> : null}
        {contactPhones.length > 0 ? (
          <Field label="聯絡電話">
            {contactPhones.map((phone) => (
              <NumberActions key={`contact-${phone.text}`} value={phone.text} mode="call" />
            ))}
          </Field>
        ) : null}
        {officePhones.length > 0 ? (
          <Field label="管理處電話">
            {officePhones.map((phone) => (
              <NumberActions key={`office-${phone.text}`} value={phone.text} mode="call" />
            ))}
          </Field>
        ) : null}
        {parsed.faxes.length > 0 ? (
          <Field label="管理處傳真">
            {parsed.faxes.map((fax) => (
              <NumberActions key={`fax-${fax.text}`} value={fax.text} mode="copy" />
            ))}
          </Field>
        ) : null}
        {parsed.worksite ? <Field label="工作地點">{parsed.worksite}</Field> : null}
        {parsed.deadline ? <Field label="期限">{parsed.deadline}</Field> : null}
        {parsed.matter ? <Field label="事宜">{parsed.matter}</Field> : null}
        {groups.length > 0 ? (
          <Field label="項目">
            <ul className="flex flex-col gap-2">
              {groups.map((group, index) => (
                <li key={`${group.descriptions.join("、")}-${index}`}>
                  {group.descriptions.map((description) => (
                    <span key={description} className="block">
                      {description}
                    </span>
                  ))}
                  {group.amount != null ? (
                    <span className="font-semibold">
                      {formatParsedAmount(group.amount)}
                      {group.shared ? <span className="ml-1 font-normal text-muted">（共用）</span> : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Field>
        ) : null}
        {parsed.total != null ? (
          <Field label="總數">
            <span className="font-semibold">{formatParsedAmount(parsed.total)}</span>
          </Field>
        ) : null}
        {parsed.remarks ? <Field label="備註">{parsed.remarks}</Field> : null}
      </dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
