"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "./LocaleProvider";

// "Read our 3rd annual impact report." — port of gainforest.earth's
// Impact Report section.
//
// Layout mirrors gainforest.earth: a soft-cream report card on the
// left (eyebrow + headline + body + CTA + the actual PDF cover image)
// and an overlapping two-photo community collage on the right
// (XPRIZE Rainforest team in Manaus + Inhaã-bé cert ceremony in the
// Philippines).
//
//   ┌────────────────┐  ┌────────────────────┐
//   │ [PDF cover] │  │   group photo (top-right)    │
//   │             │  │────────────────────┤
//   │ Headline    │  │  ceremony photo (bottom-left)│
//   │ body        │  │   overlapping diagonally     │
//   │ CTA →       │  │                              │
//   └────────────────┘  └────────────────────┘
//
// Left card sits on a warm cream block (matching gainforest.earth's
// pale-apricot fill) rather than the previous ink-on-cream. The dark
// chord in this part of the page is now carried by the closing
// NatureCTA + Footer alone, which keeps the impact-report section
// tonally aligned with the rest of the cream editorial flow.
// The impact report lives as a published Canva design (not as a page
// on gainforest.earth). The previous `/impact-report/` path returned
// 404 — the only canonical source of the report is the Canva URL
// linked from gainforest.earth's body copy.
const IMPACT_REPORT_URL =
  "https://www.canva.com/design/DAGqnTWl-gw/K4V6DWYyqtZW0NK2_0Dpag/view";

export function ImpactReport() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:items-center lg:gap-16">
          {/* Left — the report card. Warm apricot fill, with the PDF
              thumb top-right and the editorial copy filling the rest. */}
          <div className="lg:col-span-6">
            <Link
              href={IMPACT_REPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="group relative block overflow-hidden rounded-[18px] border border-[#e9c98f]/40 bg-[#f4d9a5] p-8 transition-transform hover:-translate-y-0.5 sm:p-10 lg:p-12"
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-12 sm:gap-8">
                <div className="sm:col-span-8">
                  <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-[#3a2a08]/60">
                    {t("impact.eyebrow")}
                  </span>
                  <h2 className="mt-3 font-garamond text-[28px] sm:text-[34px] lg:text-[42px] font-normal leading-[1.08] tracking-[-0.01em] text-[#1c1305]">
                    {t("impact.heading")}
                  </h2>
                  <p className="mt-4 max-w-[460px] text-[14.5px] lg:text-[15.5px] leading-[1.55] text-[#1c1305]/75">
                    {t("impact.body")}
                  </p>
                </div>

                {/* PDF cover thumbnail — portrait, soft drop shadow. */}
                <div className="relative sm:col-span-4">
                  <div className="relative mx-auto aspect-[799/720] w-[140px] sm:w-full sm:max-w-[180px]">
                    <Image
                      src="/decor/impact-report-cover.webp"
                      alt="GainForest 3rd Annual Impact Report 2024 / 2025 cover"
                      fill
                      sizes="(min-width: 1024px) 180px, 140px"
                      className="object-contain drop-shadow-[0_8px_20px_rgba(28,19,5,0.18)]"
                    />
                  </div>
                </div>
              </div>

              {/* CTA pill — dark on apricot, mirrors gainforest.earth. */}
              <span className="mt-8 inline-flex h-[52px] items-center justify-center gap-2 rounded-full border border-[#1c1305] px-7 text-[14.5px] font-medium text-[#1c1305] transition-colors group-hover:bg-[#1c1305] group-hover:text-[#f4d9a5]">
                {t("impact.cta")}
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </span>

              <span
                aria-hidden
                className="pointer-events-none absolute right-6 top-6 font-instrument italic text-[12px] tracking-[0.12em] text-[#1c1305]/40"
              >
                24 / 25
              </span>
            </Link>
          </div>

          {/* Right — two-photo collage, simplified.

              Earlier this section repeated the DataCommons recipe
              (top photo right-anchored, bottom photo bleeding past
              the column edge) but at this row position the photos
              overlapped chaotically with the apricot card to the
              left and there was no consistent visual rhythm. Audit
              feedback called it "chaotic".

              New layout: a clean side-by-side 2-photo grid with a
              small horizontal offset between them. Each photo sits
              inside an aspect-[4/3] frame so the two read as a
              tidy editorial pair without the awkward overlap. */}
          <div className="lg:col-span-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* Top-left photo — group at the maloca (XPRIZE
                  Rainforest, Manaus). Slightly inset from the top so
                  the pair reads as a quiet diagonal even without an
                  overlap. */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-[6px] shadow-[0_12px_28px_-12px_rgba(20,20,19,0.22)] sm:translate-y-3">
                <Image
                  src="/community/impact-group.webp"
                  alt="GainForest team and Indigenous community at XPRIZE Rainforest finals, Manaus"
                  fill
                  sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 44vw"
                  className="object-cover"
                />
              </div>
              {/* Bottom-right photo — Bumicerts certificate ceremony.
                  Slightly inset from the bottom so the diagonal reads
                  from top-left to bottom-right. */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-[6px] shadow-[0_12px_28px_-12px_rgba(20,20,19,0.22)] sm:-translate-y-3">
                <Image
                  src="/community/impact-ceremony.webp"
                  alt="Bumicerts certificate ceremony with community members"
                  fill
                  sizes="(min-width: 1024px) 260px, (min-width: 640px) 30vw, 44vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
