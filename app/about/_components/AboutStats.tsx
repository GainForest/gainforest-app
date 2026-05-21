"use client";

import { useLocale } from "../../_components/LocaleProvider";
import { getAboutT } from "../_messages";

// Live stats band for /about. Numbers are NOT inline mocks; they're
// passed in from the server-side `app/about/page.tsx` which calls
// the same `fetchProjectPins()` + `fetchLiveBumicerts()` pipelines
// the landing page uses (Green Globe API for the project pin count,
// hyperlabel + Hyperindex for the Bumicerts total).
//
// Layout: four big numbers in Cormorant Garamond on a cream surface,
// hairline rules between cells, italic labels underneath. The
// "communities" number is the centrepiece — it's the same count the
// Nature Guild + Partners section shows, sourced from Green Globe.
//
// Hard rule (AGENTS.md #1): no inline mock numbers in components.
// The fallback for `communitiesCount` of 0 means the upstream is
// truly empty — in that case we degrade the label to a calm "; live"
// suffix rather than printing 0+ which would read as bad data.

export function AboutStats({
  communitiesCount,
  bumicertsCount,
}: {
  communitiesCount: number;
  bumicertsCount: number;
}) {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  // The Zurich registration is the only number that lives in code
  // (it's a calendar-year derived value, not from an upstream feed).
  // 2022 = year of registration; the page-render year minus that is
  // a fair proxy for "years as a registered non-profit".
  const yearsRegistered = new Date().getFullYear() - 2022;

  const items: ReadonlyArray<{ value: string; label: string; live?: boolean }> = [
    {
      value: communitiesCount > 0 ? `${communitiesCount}+` : "; live",
      label: t("about.stats.communities"),
      live: true,
    },
    {
      value: bumicertsCount > 0 ? `${bumicertsCount}+` : "; live",
      label: t("about.stats.bumicerts"),
      live: true,
    },
    {
      value: `${yearsRegistered}`,
      label: t("about.stats.years"),
    },
    {
      value: "3",
      label: t("about.stats.continents"),
    },
  ];

  return (
    <section
      aria-label="GainForest at a glance"
      className="border-t border-border-soft bg-background"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
        <ul
          role="list"
          className="grid grid-cols-2 gap-y-10 gap-x-6 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-border-soft"
        >
          {items.map((item, i) => (
            <li key={i} className="sm:px-6 first:sm:pl-0 last:sm:pr-0">
              <div className="flex items-baseline gap-2">
                <span className="font-garamond text-[44px] sm:text-[52px] lg:text-[64px] font-normal leading-[0.95] tracking-[-0.015em] text-foreground">
                  {item.value}
                </span>
                {item.live && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark"
                    title="Streamed from the GainForest indexer"
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-pulse"
                    />
                    {t("about.live.label")}
                  </span>
                )}
              </div>
              <p className="mt-3 max-w-[220px] text-[13.5px] leading-[1.45] text-foreground/65">
                {item.label}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
