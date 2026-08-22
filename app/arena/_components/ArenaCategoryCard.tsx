import Link from "next/link";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";

/**
 * One category's summary card on the arena overview: icon + heading + open
 * count + one-line description, the whole card linking to that category's
 * sub-page where the detail lives.
 */
export function ArenaCategoryCard({
  Icon,
  title,
  description,
  openCountLabel,
  href,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  /** Translated "{count} open" label for the queue badge. */
  openCountLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-3xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
          <Icon className="size-4" />
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {openCountLabel}
        </span>
        <ChevronRightIcon
          className="ms-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
          aria-hidden
        />
      </span>
      <span className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{description}</span>
    </Link>
  );
}
