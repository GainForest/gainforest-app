"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT } from "../_messages";
import { ECOSYSTEM_PILLARS, pickLocale } from "../_data";

// "Co-developing the lexicon standard for nature data." — the open
// infrastructure section. Sits on the INK band (same dark surface
// AboutMission uses) because it's the single point in the page that
// asks the reader to step back and see the protocol layer instead of
// individual papers.
//
// Layout: editorial heading on the left, five-pillar grid on the
// right. Each pillar reads as a one-line catalog entry: bold name,
// italic role, one-sentence body, optional external arrow. The
// ATProto + Hypercerts framing is deliberate; we're not the sole
// authors of these layers, we're long-time contributors, and the
// copy says so.
export function ResearchEcosystem() {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  const before = t("research.ecosystem.heading.before").trim();
  const italic = t("research.ecosystem.heading.italic").trim();
  // The "after" key for this section contains a trailing fragment
  // (" for nature data."), not just punctuation. Render it as a
  // span — same recipe as AboutMission for non-period afters.
  const after = t("research.ecosystem.heading.after");

  return (
    <section
      id="ecosystem"
      className="scroll-mt-20 bg-ink text-ink-foreground lg:scroll-mt-24"
    >
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-10 px-6 py-16 sm:px-10 sm:py-20 lg:grid-cols-12 lg:items-start lg:gap-16 lg:px-16 lg:py-28">
        <div className="lg:col-span-5">
          <span className="font-instrument italic text-[14px] uppercase tracking-[0.18em] text-ink-foreground/55">
            {t("research.ecosystem.eyebrow")}
          </span>
          <h2 className="mt-5 font-garamond text-[32px] sm:text-[44px] lg:text-[56px] font-normal leading-[1.06] tracking-[-0.01em] text-ink-foreground">
            {before && (
              <Fragment>
                <span>{before}</span>{" "}
              </Fragment>
            )}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && <span>{after}</span>}
          </h2>
          <p className="mt-6 max-w-[480px] text-[15px] lg:text-[16.5px] leading-[1.6] text-ink-foreground/72">
            {t("research.ecosystem.subheading")}
          </p>
        </div>

        <ul
          role="list"
          className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:col-span-7 lg:gap-y-8"
        >
          {ECOSYSTEM_PILLARS.map((raw) => {
            const p = pickLocale(raw, locale);
            const content = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-garamond text-[22px] font-normal leading-[1.15] text-ink-foreground lg:text-[26px]">
                    {p.name}
                  </h3>
                  {p.href ? (
                    <span
                      aria-hidden
                      className="text-[16px] text-ink-foreground/40 transition-transform group-hover:translate-x-1 group-hover:text-brand"
                    >
                      →
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-instrument italic text-[13.5px] text-ink-foreground/55">
                  {p.role}
                </p>
                <p className="mt-3 text-[14.5px] leading-[1.55] text-ink-foreground/72">
                  {p.body}
                </p>
              </>
            );

            return (
              <li key={p.id} className="border-t border-ink-border pt-5">
                {p.href ? (
                  <Link
                    href={p.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group block transition-colors hover:text-ink-foreground"
                  >
                    {content}
                  </Link>
                ) : (
                  <div>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
