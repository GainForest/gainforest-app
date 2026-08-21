"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A collapsible sibling of {@link AdminPanel}: the same card shell, but the
 * header is a toggle and the body/footer render only when open. Use it to tuck
 * a secondary list under a primary panel without letting it dominate the view —
 * the grant applicants list sitting below the Rewilding the Web slots is the
 * first case. Starts collapsed unless `defaultOpen` is set.
 */
export function AdminCollapsiblePanel({
  icon,
  title,
  description,
  count,
  footer,
  defaultOpen = false,
  children,
}: {
  /** Rendered element (not a component), so it stays passable from a Server
   *  Component across the client boundary — same contract as AdminSectionTabs. */
  icon: ReactNode;
  title: string;
  description: string;
  /** Optional so panels that load their own data lazily can omit the badge. */
  count?: number;
  footer?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-4 py-4 text-start transition-colors hover:bg-muted/40 sm:px-6"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {count !== undefined ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {count}
              </span>
            ) : null}
          </span>
          <span className="mt-1.5 max-w-prose text-sm leading-6 text-muted-foreground">{description}</span>
        </span>
        <ChevronDownIcon
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <>
          <div className="border-t border-border/70 p-4 sm:p-5">{children}</div>
          {footer ? (
            <p className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground sm:px-6">{footer}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
