import {
  adminCanOpenReceipt,
  adminReceiptAlreadyOpen,
  adminReceiptCarryOver,
  chainFromLabel,
  chainMissingLabel,
  chainOpenLabel,
  chainStartLabel,
  chainStartedLabel,
  nextDocumentTopic,
  type ChainLink,
} from "@/lib/document-chain";
import { topicLabel, type TopicId } from "@/lib/domain";

export function DocumentChain({
  topic,
  parent,
  child,
  hrefFor,
  startHref,
  actionNote,
  className,
}: {
  topic: TopicId;
  parent: ChainLink | null;
  child: ChainLink | null;
  hrefFor: (id: string) => string;
  startHref: string | null;
  actionNote?: string | null;
  className?: string;
}) {
  const next = nextDocumentTopic(topic);
  if (!parent && !next) return null;

  return (
    <section className={className ?? "mt-4 rounded-3xl border border-line bg-card p-4"}>
      <h2 className="text-base font-semibold">相關單據</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-6">
        {parent ? (
          <p>
            <span>{chainFromLabel(parent.topic)}</span>
            <a href={hrefFor(parent.id)} className="ml-3 font-semibold text-navy underline">
              {chainOpenLabel(parent.topic)}
            </a>
          </p>
        ) : null}
        {next && child ? (
          <p>
            <span>{chainStartedLabel(child.topic)}</span>
            <a href={hrefFor(child.id)} className="ml-3 font-semibold text-navy underline">
              {chainOpenLabel(child.topic)}
            </a>
          </p>
        ) : null}
        {next && !child && startHref ? (
          <div>
            {actionNote ? <p className="font-semibold">{actionNote}</p> : null}
            <a
              href={startHref}
              className={`inline-flex min-h-11 items-center rounded-xl bg-stamp px-4 py-2 font-semibold text-white ${
                actionNote ? "mt-3" : ""
              }`}
            >
              {chainStartLabel(next)}
            </a>
            <p className="mt-2 text-muted">原本的{topicLabel(topic)}不會更改事項、狀態、訊息或檔案。</p>
          </div>
        ) : null}
        {next && !child && !startHref ? <p className="text-muted">{chainMissingLabel(next)}</p> : null}
      </div>
    </section>
  );
}

export function InvoiceReceiptPrompt({
  companyName,
  child,
  startHref,
  hrefFor,
}: {
  companyName: string;
  child: ChainLink | null;
  startHref: string;
  hrefFor: (id: string) => string;
}) {
  if (child) {
    return (
      <div className="mt-3 rounded-2xl bg-white px-3 py-3" role="status">
        <p className="text-ok">狀態已更新，並寫進時間線。</p>
        <p className="mt-2 font-semibold">{adminReceiptAlreadyOpen(companyName)}</p>
        <a href={hrefFor(child.id)} className="mt-3 inline-flex min-h-11 items-center font-semibold text-navy underline">
          {chainOpenLabel(child.topic)}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-white px-3 py-3" role="status">
      <p className="text-ok">狀態已更新，並寫進時間線。</p>
      <p className="mt-2 font-semibold">{adminCanOpenReceipt(companyName)}</p>
      <p className="mt-1 text-muted">{adminReceiptCarryOver()}</p>
      <a
        href={startHref}
        className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-stamp px-4 py-2 font-semibold text-white"
      >
        {chainStartLabel("receipt")}
      </a>
    </div>
  );
}

export function RequestChainLinks({
  parent,
  child,
  hrefFor,
}: {
  parent: ChainLink | null;
  child: ChainLink | null;
  hrefFor: (id: string) => string;
}) {
  if (!parent && !child) return null;
  return (
    <div className="mt-3 flex flex-col gap-1 text-sm">
      {parent ? (
        <a href={hrefFor(parent.id)} className="font-semibold text-navy underline">
          {chainFromLabel(parent.topic)}
        </a>
      ) : null}
      {child ? (
        <a href={hrefFor(child.id)} className="font-semibold text-navy underline">
          {chainStartedLabel(child.topic)}
        </a>
      ) : null}
    </div>
  );
}
