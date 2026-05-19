"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

// Small client island that supplies the translatable strings inside the
// otherwise server-rendered <ChoosePath /> section. Splitting it out
// keeps the section's <GlobeCard> as an async server component (which
// fetches live pins) without forcing the whole section to be client.
export function ChoosePathLabels({
  slot,
  href,
}: {
  slot: "heading" | "globe" | "bumicerts" | "or" | "allProjects";
  href?: string;
}) {
  const t = useT();

  if (slot === "heading") {
    return (
      <h2 className="text-center font-garamond text-[32px] sm:text-[40px] lg:text-[44px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground">
        {t("choosePath.heading")}
      </h2>
    );
  }
  if (slot === "or") {
    // Sits between the two equal-width path columns. On desktop it's a
    // tall vertical rule with the italic word floating mid-height; on
    // mobile it collapses to a centred horizontal line so the two
    // paths stack readably.
    return (
      <div className="relative flex items-center justify-center self-stretch py-2 lg:py-0">
        {/* horizontal rule on mobile, vertical rule on lg+ */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border lg:inset-y-0 lg:left-1/2 lg:top-0 lg:h-auto lg:w-px lg:-translate-x-1/2 lg:translate-y-0 lg:bg-border"
        />
        <span className="relative bg-background px-3 font-instrument italic text-[22px] lg:text-[26px] text-foreground/40">
          {t("choosePath.or")}
        </span>
      </div>
    );
  }
  if (slot === "allProjects") {
    return <span>{t("choosePath.allProjects")} →</span>;
  }
  if (slot === "globe" || slot === "bumicerts") {
    const titleKey =
      slot === "globe" ? "choosePath.globe.title" : "choosePath.bumicerts.title";
    const bodyKey =
      slot === "globe" ? "choosePath.globe.body" : "choosePath.bumicerts.body";
    return (
      <div>
        <h3 className="font-garamond text-[28px] lg:text-[32px] font-normal leading-[1.1] text-foreground">
          {t(titleKey)}
        </h3>
        <p className="mt-3 max-w-[320px] text-[15px] leading-[1.55] text-foreground/70">
          {t(bodyKey)}
        </p>
        {href && (
          <Link
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-foreground transition-colors hover:text-brand-dark"
          >
            <span className="border-b border-foreground/40 pb-0.5 group-hover:border-brand-dark">
              {t(titleKey)}
            </span>
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        )}
      </div>
    );
  }
  return null;
}
