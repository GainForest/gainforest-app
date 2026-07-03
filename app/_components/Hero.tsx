"use client";

import Link from "next/link";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";
import { GLOBE_URL, PROJECTS_URL } from "../_lib/urls";
import { BrushedText } from "./BrushedText";
import { useT } from "./LocaleProvider";

// Hero composition — minimalist editorial port of gainforest.earth.
//
// The headline reads in one breath: `before` + italic(`italic`) +
// `after`. We compose it at runtime so each locale chooses exactly one
// word to italicise (word order varies; see `i18n.ts`).
//
// Two layouts, driven by Tailwind responsive utilities:
//
//   - lg+: split-column desktop layout. The live Bumicerts + Globe
//     windows render INSIDE this section's right column (see the
//     `desktopCards` prop) using column-relative absolute positioning
//     so they stay anchored at every browser zoom level.
//
//   - below lg: single-column stacked composition. Headline + subtitle
//     + CTAs first, then the live windows full-width below them. The
//     mobile siblings come in via the `inlineCards` prop (passed by
//     `app/page.tsx`) so the user still sees the live data right under
//     the hero on phones.
//
// Earlier, the desktop cards lived at the PAGE level with document-
// coordinate `position: absolute` against placeholder anchors inside
// this section's right column. That broke at non-100% browser zoom —
// the cards drifted to the left at 50% zoom because their saved doc-
// coordinates no longer matched the placeholder's measured position
// after the layout reflowed. Moving them into the right column with
// container-relative positioning fixes the drift at any zoom level.
//
// We dropped the previous botanical sprig PNG (`/decor/leaves.png`) per
// the team's "thin-stroke art doesn't match the other apps + feels
// overwhelming" feedback. gainforest.earth itself relies on whitespace
// + the live cards for visual weight, not decorative botanicals.
export function Hero({
  snapshot: _snapshot,
  /** Inline cards rendered only on mobile (lg:hidden). Server-pulled
   *  data flows in from `app/page.tsx`. */
  inlineCards,
  /** Desktop cards rendered inside this section's right column on lg+.
   *  Passed in from `app/page.tsx` so we keep the live-data fetch on
   *  the server but the layout decisions co-located here. */
  desktopCards,
}: {
  snapshot: LiveBumicertsSnapshot;
  inlineCards?: React.ReactNode;
  desktopCards?: React.ReactNode;
}) {
  void _snapshot;
  const t = useT();

  // Compose the headline. The `italic` slot uses Instrument Serif's
  // italic for the editorial feel gainforest.earth uses on words like
  // *decentralizes* / *data commons* / *listen*.
  const before = t("hero.title.before").trim();
  const italic = t("hero.title.italic").trim();
  const after = t("hero.title.after").trim();

  // The brush stroke now lives on a single marked word inside
  // `before` (per the team's "only under Open" note). The italic
  // phrase below is plain italic, no brush.
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-4 px-6 pt-12 pb-14 sm:px-10 lg:px-16 lg:pt-20 lg:pb-24">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-6 pt-2">
          <h1 className="font-garamond text-[44px] sm:text-[64px] lg:text-[88px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground">
            {/* `before` may contain one `{brushed}` marker per locale.
                The marked word gets a curved paintbrush stroke
                underneath via <BrushedText />; everything else
                renders as plain text. */}
            <BrushedText text={before} />
            {" "}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && <span> {after}</span>}
          </h1>

          <p className="mt-6 lg:mt-8 max-w-[520px] text-[16px] lg:text-[18px] leading-[1.5] text-foreground/85">
            {t("hero.subtitle")}
          </p>

          <div className="mt-8 lg:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            {/* Primary pill — bright mint, matching gainforest.earth. */}
            <Link
              href={PROJECTS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[54px] items-center justify-center rounded-full bg-primary px-8 lg:px-10 text-[15px] lg:text-[16px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
            >
              {t("hero.cta.bumicerts")}
            </Link>
            {/* Secondary outline pill — same height/shape, hairline border. */}
            <Link
              href={GLOBE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[54px] items-center justify-center rounded-full border border-foreground/25 bg-transparent px-8 lg:px-10 text-[15px] lg:text-[16px] font-medium text-foreground transition-colors hover:border-foreground/60"
            >
              {t("hero.cta.globe")}
            </Link>
          </div>

          {/* MOBILE-only live windows. Render inline beneath the hero
              copy so phone visitors see the same live data desktop
              visitors get from the floating, draggable cards. Hidden on
              lg+ where the draggable versions take over. */}
          {inlineCards && (
            <div className="mt-10 flex flex-col items-stretch gap-5 lg:hidden">
              {inlineCards}
            </div>
          )}
        </div>

        {/* RIGHT: live data windows (desktop). The cards are rendered
            inside this column with `position: absolute` against this
            `relative` container — so they stay anchored to the hero
            column at every browser zoom level. The previous
            implementation lived at the page level with document-
            coordinate absolute positioning which broke at 50% zoom
            (cards drifted to the left edge of the page). */}
        <div className="relative hidden lg:block lg:col-span-6 min-h-[520px]">
          {desktopCards}
        </div>
      </div>
    </section>
  );
}
