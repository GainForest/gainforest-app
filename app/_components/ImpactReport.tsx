"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

// "Read our 3rd annual impact report." — port of gainforest.earth's
// Impact Report card.
//
// Ink-band card sitting inside the cream section. The card itself is
// dark (matching NatureCTA + Footer), so it reads as a SECOND closing
// chord earlier in the page — drawing the eye to the report download
// without committing the whole section to the dark palette.
const IMPACT_REPORT_URL = "https://www.gainforest.earth/impact-report/";

export function ImpactReport() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        {/* Card on cream, dark fill. Border-radius matches the rest of
            the page's chunky card rhythm (14 / 18 px). */}
        <Link
          href={IMPACT_REPORT_URL}
          target="_blank"
          rel="noreferrer"
          className="group relative block overflow-hidden rounded-[18px] bg-ink text-ink-foreground transition-transform hover:-translate-y-0.5"
        >
          <div className="grid grid-cols-1 gap-10 px-8 py-12 sm:px-12 sm:py-14 lg:grid-cols-12 lg:items-center lg:gap-16 lg:px-16 lg:py-20">
            <div className="lg:col-span-8">
              <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-ink-foreground/55">
                {t("impact.eyebrow")}
              </span>
              <h2 className="mt-4 font-garamond text-[28px] sm:text-[36px] lg:text-[44px] font-normal leading-[1.1] tracking-[-0.01em] text-ink-foreground">
                {t("impact.heading")}
              </h2>
              <p className="mt-5 max-w-[600px] text-[14.5px] lg:text-[16px] leading-[1.55] text-ink-foreground/75">
                {t("impact.body")}
              </p>
            </div>

            <div className="lg:col-span-4 lg:flex lg:justify-end">
              {/* CTA — cream pill on ink, mirroring NatureCTA's primary. */}
              <span className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-ink-foreground px-7 text-[14.5px] font-medium text-ink transition-colors group-hover:bg-ink-foreground/85">
                {t("impact.cta")}
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </div>
          </div>

          {/* Hairline year tag in the corner — a small editorial flourish
              that hints at the issue without competing with the headline. */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-6 top-6 font-instrument italic text-[12px] tracking-[0.12em] text-ink-foreground/40 lg:right-10 lg:top-10"
          >
            24 / 25
          </span>
        </Link>
      </div>
    </section>
  );
}
