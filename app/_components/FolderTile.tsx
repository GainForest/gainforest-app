"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EASE = [0.25, 0.1, 0.25, 1] as const;

export function formatFolderCount(value: number | null | undefined): string {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("en").format(value);
}

export type FolderTileProps = {
  title: string;
  /** Big italic figure shown on the folder. Ignored when `countLabel` is set. */
  count?: number | null;
  /** Overrides the figure with arbitrary text (e.g. "+" for an add tile). */
  countLabel?: string;
  /** Small illustration that peeks out from behind the folder, tucked right. */
  art?: ReactNode;
  /** Render as a link. Mutually exclusive with `onClick`. */
  href?: string;
  /** Render as a button. Mutually exclusive with `href`. */
  onClick?: () => void;
  /** Highlight the folder as the active selection. */
  active?: boolean;
  /** Stagger index for the entrance animation. */
  index?: number;
  ariaLabel?: string;
  ariaPressed?: boolean;
  disabled?: boolean;
};

/**
 * The shared "folder" visual used across the app — a card with a rounded tab,
 * a large italic figure, a label, and an optional illustration peeking from
 * behind it. Originally the account-overview folder; extracted so observation
 * datasets (and anything else) can reuse exactly the same shape.
 */
export function FolderTile({
  title,
  count,
  countLabel,
  art,
  href,
  onClick,
  active = false,
  index = 0,
  ariaLabel,
  ariaPressed,
  disabled = false,
}: FolderTileProps) {
  const inner = (
    <>
      {art ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-end pr-3.5">
          <div className="rotate-6 transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:rotate-0">
            {art}
          </div>
        </div>
      ) : null}

      <div className="relative pt-7">
        {/* tab */}
        <div
          className={cn(
            "absolute left-0 top-[12px] z-20 h-[19px] w-[42%] rounded-t-lg border border-b-0 bg-card transition-colors duration-300",
            active ? "border-primary/50" : "border-border/60 group-hover:border-primary/40",
          )}
        />
        {/* body */}
        <div
          className={cn(
            "relative z-10 flex min-h-[86px] flex-col justify-end rounded-[18px] rounded-tl-none border bg-card p-3.5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_-16px_oklch(0_0_0/0.26)]",
            active ? "border-primary/50 shadow-[0_14px_32px_-16px_oklch(0_0_0/0.26)]" : "border-border/60 group-hover:border-primary/40",
          )}
        >
          <div className="font-instrument text-[28px] italic leading-[0.85] text-foreground">
            {countLabel ?? formatFolderCount(count)}
          </div>
          <p
            className={cn(
              "mt-1 text-[13px] font-medium transition-colors duration-300",
              active ? "text-primary" : "text-foreground/75 group-hover:text-primary",
            )}
          >
            {title}
          </p>
        </div>
      </div>
    </>
  );

  const surfaceClass = cn(
    "group relative block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-[18px]",
    disabled && "pointer-events-none opacity-60",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: EASE }}
    >
      {href ? (
        <Link href={href} className={surfaceClass} aria-label={ariaLabel}>
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-pressed={ariaPressed}
          className={surfaceClass}
        >
          {inner}
        </button>
      )}
    </motion.div>
  );
}

/**
 * A loading placeholder shaped exactly like {@link FolderTile} — same rounded
 * tab, body card, big-figure block and label line — so a grid of these reads as
 * "folders are loading" without any layout shift when the real tiles arrive.
 * Pass the same `art` the real tile uses (in a muted form) to echo the folder's
 * peeking illustration.
 */
export function FolderTileSkeleton({ art, index = 0 }: { art?: ReactNode; index?: number }) {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: EASE }}
    >
      <div className="relative block w-full">
        {art ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-end pr-3.5">
            <div className="rotate-6">{art}</div>
          </div>
        ) : null}

        <div className="relative pt-7">
          {/* tab */}
          <div className="absolute left-0 top-[12px] z-20 h-[19px] w-[42%] rounded-t-lg border border-b-0 border-border/60 bg-card" />
          {/* body */}
          <div className="relative z-10 flex min-h-[86px] flex-col justify-end rounded-[18px] rounded-tl-none border border-border/60 bg-card p-3.5">
            <Skeleton className="h-7 w-10" />
            <Skeleton className="mt-1.5 h-3 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default FolderTile;
