"use client";

import type { MessageKey } from "../_lib/i18n";
import { useT } from "./LocaleProvider";

// Shared live indicator used in:
//
//   - Hero <BumicertsCard /> + <DraggableGlobeCard /> chrome rows
//   - <ChoosePathClient />'s two card eyebrow rows
//
// Same pill, same dot/ping animation, same position rules — keeps the
// "data is live" signal consistent across the page. Hovering (or
// focusing for keyboard users) reveals a CSS-only tooltip explaining
// what's being streamed; copy comes from i18n so it stays localised.
//
// The tooltip uses a named Tailwind group (`group/live`) so it does
// not clash with any `group` hover state the parent card may already
// own.
//
// The pill is also a link to GainForest's public status page so a
// visitor who notices a stale/fallback badge can jump straight to the
// uptime dashboard. We link in both live and fallback states because
// the status page is exactly where you'd check when data looks off.
const STATUS_URL = "https://gainforest-status.instatus.com/";

export function LivePill({
  isLive,
  tooltipKey,
  className,
}: {
  isLive: boolean;
  /** i18n key for the tooltip body. Different per card (Globe vs
   *  Bumicerts) and per state (live vs fallback). */
  tooltipKey: MessageKey;
  /** Optional layout override on the outer wrapper — e.g. `ml-auto` so
   *  the pill sits at the right edge of a flex row inside the hero
   *  cards' chrome. */
  className?: string;
}) {
  const t = useT();
  const label = isLive
    ? t("choosePath.liveBadge")
    : t("choosePath.recentBadge");
  return (
    <span
      className={
        "group/live relative inline-flex shrink-0" +
        (className ? ` ${className}` : "")
      }
    >
      <a
        href={STATUS_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="View GainForest live status"
        className={
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/20 " +
          (isLive
            ? "bg-brand/15 text-brand-dark hover:bg-brand/25"
            : "bg-foreground/5 text-foreground/45 hover:bg-foreground/10")
        }
      >
        {isLive && (
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
        )}
        {label}
        {/* External-link arrow so the badge reads as clickable; sits
            right next to the label and points at the status page. */}
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="opacity-70"
        >
          <path
            d="M7 17L17 7M9 7h8v8"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
      {/* Hover/focus tooltip. Anchored to the pill's right edge so it
          stays inside narrower parent containers (hero card chrome can
          be as tight as 280 px), and pushed below with mt 6px. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-20 w-[220px] origin-top-right rounded-md border border-border-soft bg-background px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-foreground/75 opacity-0 shadow-[0_10px_24px_-18px_rgba(40,50,30,0.30)] transition-all duration-150 group-hover/live:opacity-100 group-focus-within/live:opacity-100"
      >
        {t(tooltipKey)}
      </span>
    </span>
  );
}
