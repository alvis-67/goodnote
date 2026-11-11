import { InstantLink } from "@/components/instant-link";
import { chainFromLabel, chainOpenLabel, chainStartedLabel, type ChainLink } from "@/lib/document-chain";

export function DocumentChain({
  parent,
  child,
  hrefFor,
  className,
}: {
  parent: ChainLink | null;
  child: ChainLink | null;
  hrefFor: (id: string) => string;
  className?: string;
}) {
  if (!parent && !child) return null;

  return (
    <section className={className ?? "mt-4 rounded-3xl border border-line bg-card p-4"}>
      <h2 className="text-base font-semibold">相關單據</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-6">
        {parent ? (
          <p>
            <span>{chainFromLabel(parent.topic)}</span>
            <InstantLink href={hrefFor(parent.id)} className="ml-3 font-semibold text-navy underline">
              {chainOpenLabel(parent.topic)}
            </InstantLink>
          </p>
        ) : null}
        {child ? (
          <p>
            <span>{chainStartedLabel(child.topic)}</span>
            <InstantLink href={hrefFor(child.id)} className="ml-3 font-semibold text-navy underline">
              {chainOpenLabel(child.topic)}
            </InstantLink>
          </p>
        ) : null}
      </div>
    </section>
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
        <InstantLink href={hrefFor(parent.id)} className="font-semibold text-navy underline">
          {chainFromLabel(parent.topic)}
        </InstantLink>
      ) : null}
      {child ? (
        <InstantLink href={hrefFor(child.id)} className="font-semibold text-navy underline">
          {chainStartedLabel(child.topic)}
        </InstantLink>
      ) : null}
    </div>
  );
}
