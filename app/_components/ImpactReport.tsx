"use client";

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { useT } from "./LocaleProvider";

// "Read our 3rd annual impact report." — the editorial bridge between
// the cream body of the page and the closing CTA / Footer ink band.
//
// Earlier this section shipped on a warm apricot card (#f4d9a5) to
// echo gainforest.earth's actual impact-report tile. The team's
// verdict on that pass: "the yellow is weird, the cover image is
// tiny, the photos look low-res, button looks off". Apricot doesn't
// recur anywhere else on the page, so it read as an orphan colour
// and made the section feel separate from the cream-on-cream
// editorial flow above and below.
//
// Re-pass after the apricot-tile version:
//   • drop the apricot fill. The section now sits on the canonical
//     cream `--background` like the rest of the editorial flow.
//   • make the PDF cover the visual anchor at ~320 px wide instead
//     of a ~140 px thumbnail. The cover's watercolor mountain
//     illustration is itself a beautiful artifact — the section's
//     job is to invite a click, so the cover deserves the optical
//     weight.
//   • sage primary CTA (matching every other primary on the page)
//     instead of the bespoke apricot-border / dark-fill recipe.
//   • italic emphasis on a single word in the heading (English
//     "annual"; per-locale via the `{word}` marker convention we
//     already use in Hero.tsx) to match the design system rule
//     "headlines use serif with italic emphasis on a single word —
//     never a whole line".
//   • NO extra cream/ring frame around the cover. The cover's own
//     cream background already sits on a cream section, so adding
//     `bg-[#fbf8f0]` + `ring-border-soft` produced a visible double
//     frame against the section background. The cover now floats on
//     a soft drop-shadow alone (same recipe gainforest.earth uses).
//   • NO second row of community photos. The earlier version added
//     a 2-up landscape collage as "editorial proof" but that made
//     the section the tallest block in the lower page and pulled
//     attention away from the report itself. The community work is
//     already shown in DataCommons / EquitableAI above, so we don't
//     need to re-litigate it here — this is the *report* section,
//     not a gallery.

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

        {/* Single row — the PDF cover (visual anchor) + the copy /
            CTA on the right. The cover takes 4/12 and the copy 8/12
            so the headline has plenty of horizontal runway and the
            section stays compact vertically. */}
        <div className="mt-8 grid grid-cols-1 items-center gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-4">
            <Link
              href={IMPACT_REPORT_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={t("impact.cta")}
              className="group relative mx-auto block w-full max-w-[320px] transition-transform duration-300 hover:-translate-y-1 lg:mx-0"
            >
              {/* The cover is portrait at 461×652 ≈ 5:7 after we
                  trimmed the wide transparent right-side margin the
                  original PDF-export shipped with (the un-trimmed
                  canvas was 799×720, so the 310 px of transparent
                  padding on the right showed up as a visible cream
                  “frame” next to the artwork). We frame at the
                  trimmed aspect so the cover sits edge-to-edge with
                  just a soft long shadow lifting it off the page. */}
              <div className="relative aspect-[461/652] w-full overflow-hidden rounded-[8px] shadow-[0_22px_50px_-24px_rgba(40,50,30,0.36),0_2px_4px_rgba(40,50,30,0.06)] transition-shadow duration-300 group-hover:shadow-[0_30px_60px_-22px_rgba(40,50,30,0.44),0_2px_4px_rgba(40,50,30,0.08)]">
                <Image
                  src="/decor/impact-report-cover.webp"
                  alt="GainForest 3rd Annual Impact Report 2024 / 2025 cover"
                  fill
                  sizes="(min-width: 1024px) 320px, (min-width: 640px) 40vw, 80vw"
                  priority={false}
                  className="object-cover"
                />
              </div>
            </Link>
          </div>

          <div className="lg:col-span-8">
            <h2 className="font-garamond text-[36px] sm:text-[44px] lg:text-[60px] font-normal leading-[1.04] tracking-[-0.012em] text-foreground">
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

            <p className="mt-5 max-w-[560px] text-[16px] lg:text-[17.5px] leading-[1.55] text-foreground/80">
              {t("impact.body")}
            </p>

            <div className="mt-7 lg:mt-9">
              {/* Same sage pill recipe Hero / NatureCTA use, so the
                  CTA reads as part of the page's single primary
                  language. The "Read the report →" copy stays the
                  same; the chevron animates on hover like other
                  CTAs on the page. */}
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
        </div>
      </div>
    </section>
  );
}
