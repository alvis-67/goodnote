"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";

export function InstantLink({
  href,
  className,
  children,
  replace,
  ariaCurrent,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  replace?: boolean;
  ariaCurrent?: "page";
}) {
  return (
    <Link href={href} className={className} replace={replace} aria-current={ariaCurrent}>
      <InstantLinkBody>{children}</InstantLinkBody>
    </Link>
  );
}

function InstantLinkBody({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? "opacity-70" : undefined} aria-busy={pending || undefined}>
      {children}
      {pending ? (
        <span role="status" className="ml-2 text-sm font-semibold">
          正在開啟…
        </span>
      ) : null}
    </span>
  );
}
