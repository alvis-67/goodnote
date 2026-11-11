import { InstantLink } from "@/components/instant-link";
import { CLIENT_LIST_LABEL } from "@/lib/client-nav";
import { clientHomePath } from "@/lib/paths";

export function ClientListLink({ className }: { className?: string }) {
  return (
    <InstantLink
      href={clientHomePath}
      className={className ?? "inline-flex min-h-11 items-center text-sm font-semibold text-navy"}
    >
      {CLIENT_LIST_LABEL}
    </InstantLink>
  );
}
