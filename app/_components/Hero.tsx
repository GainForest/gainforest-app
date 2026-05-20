"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";
import { useT } from "./LocaleProvider";

// Single arced brush sweep — ported from the Bumicerts hero at
// alpha.fund.gainforest.app (the "Real Communities" underline the
// team picked as the visual reference). The reference draws the
// brush as a STROKED cubic curve (not a filled lens) with rounded
// line caps, which is what gives it a visible arc and soft brush-
// like ends. We mirror that exactly: same viewBox (178×16) and
// same cubic control points so the curve shape is identical, then
// `preserveAspectRatio="none"` stretches the brush to the width of
// the brushed word.
//
// The cubic `M3 10.5 C44 6.5, 87 6, 175 8.5` sweeps from (3, 10.5)
// on the left up through (44, 6.5) and (87, 6) and lands at
// (175, 8.5) on the right — left tip slightly lower, peak around
// y=6 in the middle, right tip a touch higher. That asymmetric arc
// reads as a hand-drawn paint stroke rather than a perfectly
// symmetric lens.
const BRUSH_PATH = "M 3 10.5 C 44 6.5 87 6 175 8.5";
const BRUSH_VIEWBOX = "0 0 178 16";

// Parse a `before` translation string with optional `{brushed}`
// markers into ordered segments. Each locale uses the marker to
// pick which word(s) should receive the brush stroke — important
// because the position of the emphasis word shifts between
// languages (English `{Open} tools for` vs Spanish `Herramientas
// {abiertas} para la`, etc.). Plain text outside the markers comes
// through untouched, spaces and all, so word boundaries render
// naturally.
function parseBrushed(
  text: string,
): Array<{ brushed?: true; text: string }> {
  const segments: Array<{ brushed?: true; text: string }> = [];
  let lastIndex = 0;
  const regex = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    segments.push({ brushed: true, text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }
  return segments;
}

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// Hero composition — minimalist editorial port of gainforest.earth.
//
// The headline reads in one breath: `before` + italic(`italic`) +
// `after`. We compose it at runtime so each locale chooses exactly one
// word to italicise (word order varies; see `i18n.ts`).
//
// Two layouts, driven by Tailwind responsive utilities:
//
//   - lg+: split-column desktop layout. The live Bumicerts + Globe
//     windows render at the page level (see `app/page.tsx`) with
//     `position: absolute` against placeholder anchors inside the right
//     column.
//
//   - below lg: single-column stacked composition. Headline + subtitle
//     + CTAs first, then the live windows full-width below them. The
//     draggable absolute cards are hidden on mobile (wrapped in
//     `hidden lg:block` in page.tsx) and we mount the inline siblings
//     here so the user still sees the live data right under the hero.
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
}: {
  snapshot: LiveBumicertsSnapshot;
  inlineCards?: React.ReactNode;
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
  const beforeSegments = parseBrushed(before);

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-4 px-6 pt-12 pb-14 sm:px-10 lg:px-16 lg:pt-20 lg:pb-24">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-6 pt-2">
          <h1 className="font-garamond text-[44px] sm:text-[64px] lg:text-[88px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground">
            {/* `before` may contain one `{brushed}` marker per locale.
                The marked word gets a curved paintbrush stroke
                underneath; everything else renders as plain text. The
                stroke is positioned via `top: 100%` so it sits
                cleanly below the descenders, and stretches with the
                word width via `preserveAspectRatio="none"`. */}
            {beforeSegments.map((segment, i) =>
              segment.brushed ? (
                <span key={i} className="relative inline-block">
                  <span className="relative z-[1]">{segment.text}</span>
                  <svg
                    aria-hidden
                    preserveAspectRatio="none"
                    viewBox={BRUSH_VIEWBOX}
                    className="pointer-events-none absolute left-0 right-0 -bottom-2 z-0 h-4 w-full overflow-visible text-primary"
                  >
                    <path
                      d={BRUSH_PATH}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.75}
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              ) : (
                <Fragment key={i}>{segment.text}</Fragment>
              ),
            )}
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
              href={`${BUMICERTS_URL}/explore`}
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

        {/* RIGHT: placeholders for the two draggable cards (desktop). The
            cards themselves are rendered at the page level (see
            `app/page.tsx`) so they can use document-coordinate
            `position: absolute` and scroll with the page. The
            placeholders reserve their hero slots and give the client
            components a known starting position to read on mount.

            We removed the previous botanical sprig that lived in the
            gutter between text and cards — its thin pen-style strokes
            looked foreign next to the chunky live UI windows. */}
        <div className="relative hidden lg:block lg:col-span-6 min-h-[520px]">
          {/* right-[-35px] pushes the Globe card past the column's right
              edge so the sphere ends up sitting ~25% behind the
              Bumicerts card and ~75% peeking out on the right. */}
          <div
            id="bumicerts-card-anchor"
            aria-hidden
            className="pointer-events-none absolute left-0 top-[140px] h-[360px] w-[400px]"
          />
          <div
            id="globe-card-anchor"
            aria-hidden
            className="pointer-events-none absolute right-[-35px] top-[20px] h-[360px] w-[280px]"
          />
        </div>
      </div>
    </section>
  );
}
