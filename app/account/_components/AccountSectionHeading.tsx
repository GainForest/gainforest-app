import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The heading every section of an account's Overview shares.
 *
 * The Overview reads as a short article — who this is, what they run, what
 * they've been publishing. Without a rule between them those blocks ran into
 * each other and stopped looking like sections at all, so each section now also
 * opens with a hairline (`border-t border-border/60` plus top padding, applied
 * by whichever layout owns the section box, since the rule has to sit above the
 * heading and span the whole column).
 *
 * Section titles use the app's display serif, so a section reads as editorial
 * rather than as a form label.
 */
export function AccountSectionHeading({
  children,
  action,
  className,
}: {
  children: ReactNode;
  /** Optional trailing link, e.g. "See all". */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <h2 className="font-instrument text-2xl italic leading-none text-foreground">{children}</h2>
      {action}
    </div>
  );
}
