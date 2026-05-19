"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

// Small client island that supplies the translatable strings inside the
// otherwise server-rendered <ChoosePath /> section. Splitting it out
// keeps the section's <GlobeCard> as an async server component (which
// fetches live pins) without forcing the whole section to be client.
//
// The slots produce the compact text/heading treatment the
// pre-redesign 5-column inline layout used — smaller H2 than the hero,
// smaller H3s than the previous symmetric two-path layout, and an
// inline italic "or" (no full-width divider rule) so the row reads as
// a single horizontal beat:
//
//   [Open the Globe ↳] [globe] [or] [Explore Bumicerts ↳] [mini card]
//
// Mobile (lg-) stacks the same five blocks vertically.
export function ChoosePathLabels({
  slot,
  href,
}: {
  slot: "heading" | "globe" | "bumicerts" | "or" | "allProjects";
  href?: string;
}) {
  const t = useT();

  if (slot === "heading") {
    // Sits one editorial step below the hero's 88px headline — large
    // enough to anchor the section, small enough that the live globe
    // and the mini Bumicerts card next to it still carry visual
    // weight (they used to share the row with the title, not be
    // dwarfed by it).
    return (
      <h2 className="text-center font-garamond text-[28px] sm:text-[32px] lg:text-[36px] font-normal leading-[1.15] tracking-[-0.005em] text-foreground">
        {t("choosePath.heading")}
      </h2>
    );
  }
  if (slot === "or") {
    // Inline italic word between the two paths — NO divider rule.
    // The pre-redesign layout used `or` as a one-word column inside
    // a horizontal row, so a full-width rule would visually split
    // the row in half and break the "five things side by side"
    // reading. On mobile the same column collapses to a centred
    // italic separator between the stacked blocks.
    return (
      <span className="block text-center font-instrument italic text-[22px] lg:text-[24px] text-foreground/40">
        {t("choosePath.or")}
      </span>
    );
  }
  if (slot === "allProjects") {
    // Used as the header label inside the mini Bumicerts card —
    // mirrors the small uppercase "All projects" pill the alpha.fund
    // explore page uses at the top of its grid.
    return <>{t("choosePath.allProjects")}</>;
  }
  if (slot === "globe" || slot === "bumicerts") {
    const titleKey =
      slot === "globe" ? "choosePath.globe.title" : "choosePath.bumicerts.title";
    const bodyKey =
      slot === "globe" ? "choosePath.globe.body" : "choosePath.bumicerts.body";
    return (
      <div className="max-w-[280px]">
        <h3 className="font-garamond text-[22px] lg:text-[24px] font-normal leading-[1.15] text-foreground">
          {t(titleKey)}
        </h3>
        <p className="mt-2.5 text-[14px] leading-[1.55] text-foreground/65">
          {t(bodyKey)}
        </p>
        {href && (
          <Link
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary transition-colors hover:text-primary-dark"
          >
            <span className="border-b border-primary/40 pb-0.5 group-hover:border-primary-dark">
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
