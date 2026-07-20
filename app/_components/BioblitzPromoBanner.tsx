"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BinocularsIcon, ChevronRightIcon, XIcon } from "lucide-react";

const SESSION_KEY = "bioblitz-banner-dismissed";

/**
 * Full-width promo strip pinned above the sidebar and main content. Tapping it
 * navigates straight to the BioBlitz challenge page. The trailing close control
 * dismisses the strip for the rest of the browser session.
 */
export function BioblitzPromoBanner() {
  const t = useTranslations("marketplace.bioblitz");
  const hasBannerCopy =
    t.has("banner.message") && t.has("banner.cta") && t.has("banner.dismiss");
  const [dismissed, setDismissed] = useState(false);

  // Restore the session dismissal (state alone survives client navigation; this
  // covers a full reload within the same tab session).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") setDismissed(true);
    } catch {
      // Private windows can block storage; fall back to in-memory state.
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  if (dismissed || !hasBannerCopy) return null;

  return (
    <div className="flex shrink-0 items-stretch bg-primary text-primary-foreground">
      {/* The strip itself — a link straight to the BioBlitz challenge. The
          message and CTA wrap onto separate lines on narrow screens. The
          dismiss control is a separate flex column (below), so the link
          content can never slide underneath it at any width. The left padding
          mirrors the dismiss column so the message stays roughly centered. */}
      <Link
        href="/bioblitz"
        className="flex min-w-0 flex-1 flex-nowrap items-center justify-start gap-x-2 py-2 pl-3 pr-2 transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40 sm:flex-wrap sm:justify-center sm:gap-x-3 sm:gap-y-1 sm:py-2.5 sm:pl-12 sm:pr-3 sm:text-center"
      >
        <span className="inline-flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <BinocularsIcon className="hidden size-4 shrink-0 sm:block" aria-hidden />
          {/* On phones the message stays on one line (smaller text, no wrap,
              ellipsis as a last resort); from sm up it returns to the centered,
              wrappable strip. */}
          <span className="truncate text-[11px] font-medium leading-snug sm:overflow-visible sm:whitespace-normal sm:text-sm">
            {t("banner.message")}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-0.5 text-[11px] font-semibold sm:px-3 sm:py-1 sm:text-xs">
          {t("banner.cta")}
          <ChevronRightIcon className="size-3.5" aria-hidden />
        </span>
      </Link>

      {/* Session dismissal — its own full-height column on the right, never
          navigates, never overlaps the link content. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("banner.dismiss")}
        className="flex w-11 shrink-0 items-center justify-center text-primary-foreground/70 transition-colors hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40 sm:w-12"
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
