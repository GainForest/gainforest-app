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

  if (dismissed) return null;

  return (
    <div className="relative shrink-0">
      {/* The strip itself — a link straight to the BioBlitz challenge. */}
      <Link
        href="/bioblitz"
        className="flex w-full items-center justify-center gap-x-3 gap-y-1 bg-primary px-4 py-2.5 text-center text-primary-foreground transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40"
      >
        <BinocularsIcon className="hidden size-4 shrink-0 sm:block" aria-hidden />
        <span className="text-sm font-medium leading-snug">{t("banner.message")}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
          {t("banner.cta")}
          <ChevronRightIcon className="size-3.5" aria-hidden />
        </span>
      </Link>

      {/* Session dismissal — sits above the strip, never navigates. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("banner.dismiss")}
        className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-primary-foreground/80 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40"
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
