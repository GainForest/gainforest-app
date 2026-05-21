"use client";

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { useT } from "./LocaleProvider";

// "Read our 3rd annual impact report." — the editorial bridge between
// the cream body of the page and the integrated closing footer.
//
// Earlier this section shipped on a warm apricot card (#f4d9a5) to
// echo gainforest.earth's actual impact-report tile. The team's
// verdict on that pass: "the yellow is weird, the cover image is
// tiny, the photos look low-res, button looks off". Apricot doesn't
// recur anywhere else on the page, so it read as an orphan colour
// and made the section feel separate from the cream-on-cream
// editorial flow above and below.
//
// Final layout, after three rounds of team feedback:
//
//   │ IMPACT REPORT ──────────────────────────────── 24 / 25 │
//   │                                                       │
//   │ ┌────────┐   Read our 3rd     ┌───────────────┐    │
//   │ │  PDF   │   *annual* impact   │  maloca group  │    │
//   │ │ cover  │   report.           └───────────────┘    │
//   │ └────────┘                        Inhaã-bé, Manaus  │
//   │  Canva     Body text…          ┌───────────────┐    │
//   │            [Read the report →]  │ cert ceremony │    │
//   │                                 └───────────────┘    │
//   │                                  Cagwait, Philippines    │
//
// Design decisions encoded above:
//
//   • No apricot tile. Sits on the canonical cream `--background`
//     like every other editorial section.
//   • Quiet section eyebrow + hairline rule + "24 / 25" marker so
//     the section reads as one editorial moment rather than a
//     self-contained card.
//   • Cover at ~220 px wide. The source artwork is only 461 px wide
//     after we trimmed the 310 px transparent right-margin from the
//     original 799×720 PDF export, so scaling it bigger upscaled past
//     the source resolution and the watercolour went soft. ~220 px
//     keeps each device pixel mapped close to source.
//   • Community photos stay in the same row as a slim third column —
//     two stacked landscape thumbs at the source 3:2 aspect (no harsh
//     portrait crop) with italic field captions underneath. They give
//     the section its documentary anchor without growing a second row
//     under the cover the way the earlier 2-up gallery did.
//   • Italic emphasis on a single word in the heading (English
//     "annual"; per-locale via the `{word}` marker convention we
//     already use in Hero.tsx) to match the design system rule
//     "headlines use serif with italic emphasis on a single word".
//   • Sage primary CTA (same pill recipe as every other primary).
//   • NO extra cream/ring frame around the cover. The cover already
//     has its own cream background; an outer cream + ring wrapper
//     against the section's cream produced a visible double frame.

// The impact report itself is a published Canva design (no canonical
// gainforest.earth page; that URL 404s). Linking straight to Canva
// is the only stable surface.
const IMPACT_REPORT_URL =
  "https://www.canva.com/design/DAGqnTWl-gw/K4V6DWYyqtZW0NK2_0Dpag/view";

// Parse a heading string with one `{italicised}` marker into ordered
// segments. Mirrors the parseBrushed pattern in Hero.tsx: each locale
// picks its own emphasis word, the marker can sit anywhere in the
// sentence, plain text outside the markers comes through verbatim so
// word boundaries and punctuation render naturally.
function parseItalic(text: string): Array<{ italic?: true; text: string }> {
  const segments: Array<{ italic?: true; text: string }> = [];
  const regex = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ italic: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

export function ImpactReport() {
  const t = useT();
  const headingSegments = parseItalic(t("impact.heading"));

  return (
    <section className="border-t border-border-soft bg-background">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-14 sm:px-10 lg:px-16 lg:py-20">
        {/* Quiet section eyebrow above the grid — mirrors the
            "selected media" / "supporters" framing the rest of the
            lower page uses, so the impact report doesn't read as a
            self-contained card but as an editorial moment. */}
        <div className="flex items-center gap-4">
          <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
            {t("impact.eyebrow")}
          </span>
          <span aria-hidden className="h-px flex-1 bg-border-soft" />
          <span
            aria-hidden
            className="font-instrument italic text-[13px] tracking-[0.12em] text-foreground/45"
          >
            24 / 25
          </span>
        </div>

        {/* Three-column row — PDF cover (visual anchor) | copy / CTA
            (the centre of gravity) | community photo stack (the
            documentary anchor). Items align top so the headline +
            body + CTA hang from the top of the column rather than
            floating mid-row, which would create awkward whitespace
            below the small cover. */}
        <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-12">
          {/* COL 1 — PDF cover. Capped at 220 px wide because the
              trimmed source artwork is only 461 px wide; any larger
              and the watercolour goes soft. */}
          <div className="lg:col-span-3">
            <Link
              href={IMPACT_REPORT_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={t("impact.cta")}
              className="group relative mx-auto block w-full max-w-[220px] transition-transform duration-300 hover:-translate-y-1 lg:mx-0"
            >
              <div className="relative aspect-[461/652] w-full overflow-hidden rounded-[8px] shadow-[0_22px_50px_-24px_rgba(40,50,30,0.36),0_2px_4px_rgba(40,50,30,0.06)] transition-shadow duration-300 group-hover:shadow-[0_30px_60px_-22px_rgba(40,50,30,0.44),0_2px_4px_rgba(40,50,30,0.08)]">
                <Image
                  src="/decor/impact-report-cover.webp"
                  alt="GainForest 3rd Annual Impact Report 2024 / 2025 cover"
                  fill
                  sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 65vw"
                  priority={false}
                  className="object-cover"
                />
              </div>
              <span className="mt-3 block text-center font-instrument italic text-[13px] text-foreground/55 lg:text-left">
                3rd Annual Report &middot; Canva
              </span>
            </Link>
          </div>

          {/* COL 2 — copy + CTA. Headline scales from 32 (mobile) →
              56 (desktop). 56 was chosen over 60 so the headline
              fits comfortably in the slimmer column without ever
              wrapping past three lines on the widest English
              wording. */}
          <div className="lg:col-span-5">
            <h2 className="font-garamond text-[32px] sm:text-[40px] lg:text-[56px] font-normal leading-[1.04] tracking-[-0.012em] text-foreground">
              {headingSegments.map((seg, i) =>
                seg.italic ? (
                  <span
                    key={i}
                    className="font-instrument italic font-normal"
                  >
                    {seg.text}
                  </span>
                ) : (
                  <Fragment key={i}>{seg.text}</Fragment>
                ),
              )}
            </h2>

            <p className="mt-5 max-w-[520px] text-[15.5px] lg:text-[17px] leading-[1.55] text-foreground/80">
              {t("impact.body")}
            </p>

            <div className="mt-7 lg:mt-8">
              {/* Same sage pill recipe Hero / Footer use, so the CTA
                  reads as part of the page's single primary language. */}
              <Link
                href={IMPACT_REPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="group/cta inline-flex h-[54px] items-center justify-center gap-2 rounded-full bg-primary px-8 lg:px-10 text-[15px] lg:text-[16px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
              >
                {t("impact.cta")}
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover/cta:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
          </div>

          {/* COL 3 — community photo stack. Two stacked landscape
              thumbs at the source 3:2 aspect (matches impact-group
              exactly; impact-ceremony's 4:3 source gets a small
              top/bottom crop). Italic captions underneath identify
              the location — same tone as DataCommons photo captions.

              On mobile this column flows below the copy as a 2-up
              row (sm:grid-cols-2) so the photos still feel like a
              pair instead of stacking the full width. */}
          <div className="lg:col-span-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:gap-5">
              <figure className="m-0">
                <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[8px] ring-1 ring-border-soft shadow-[0_14px_30px_-22px_rgba(40,50,30,0.28)]">
                  <Image
                    src="/community/impact-group.webp"
                    alt="GainForest team and Indigenous community at the maloca, XPRIZE Rainforest finals in Manaus"
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-2 font-instrument italic text-[13px] text-foreground/55">
                  Inhaã-bé, Greater Manaus
                </figcaption>
              </figure>

              <figure className="m-0">
                <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[8px] ring-1 ring-border-soft shadow-[0_14px_30px_-22px_rgba(40,50,30,0.28)]">
                  <Image
                    src="/community/impact-ceremony.webp"
                    alt="Bumicerts certificate ceremony with community members in the Philippines"
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-2 font-instrument italic text-[13px] text-foreground/55">
                  Cagwait, Philippines
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
