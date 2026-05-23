"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT } from "../_messages";
import { WORKSHOP_PAPERS } from "../_data";

// "A six-year run at Climate Change AI." — compact academic
// bibliography for the six workshop papers (CCAI at NeurIPS / ICML /
// ICLR) that trace GainForest's research arc from the 2019 founding
// proposal through ForestBench 2022.
//
// Layout follows the AboutStory / library-catalog rhythm: hairline-
// divided rows, left column carries the year + venue in Garamond +
// small caps, right column carries the title (Garamond), authors
// (italic), an optional CCAI award chip, and the external arrow.
// One row per paper, all clickable through to the canonical
// climatechange.ai paper page.
//
// Sits on cream between <ResearchModels /> and <ResearchClosing />
// so the dark ATProto block stays the only ink beat on the lower
// half of the page. The headline italic emphasis ("Climate Change
// AI") is plain italic (not brushed) — the brush stroke is the
// hero's single signature gesture; repeating it on every h2 would
// dilute it.
export function ResearchWorkshop() {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  const before = t("research.workshop.heading.before").trim();
  const italic = t("research.workshop.heading.italic").trim();
  const after = t("research.workshop.heading.after").trim();

  return (
    <section
      id="workshop"
      className="scroll-mt-20 border-t border-border-soft bg-background lg:scroll-mt-24"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("research.workshop.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[42px] lg:text-[54px] font-normal leading-[1.06] tracking-[-0.01em] text-foreground">
              {before && (
                <Fragment>
                  <span>{before}</span>{" "}
                </Fragment>
              )}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && (after === "." ? after : <span> {after}</span>)}
            </h2>
          </div>
          <p className="text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70 lg:col-span-5">
            {t("research.workshop.subheading")}
          </p>
        </div>

        <ol
          role="list"
          className="mt-12 border-t border-border-soft lg:mt-16"
        >
          {WORKSHOP_PAPERS.map((paper) => (
            <li key={paper.slug} className="border-b border-border-soft">
              <Link
                href={paper.href}
                target="_blank"
                rel="noreferrer"
                className="group grid grid-cols-12 items-start gap-6 py-7 transition-colors hover:bg-foreground/[0.02] sm:gap-10 lg:py-8"
              >
                {/* Left column: year + venue, stacked.
                    Year reads as the dominant typographic anchor;
                    venue chips below in small-caps italic mirror the
                    way the publications carousel labels its venue. */}
                <div className="col-span-12 flex items-baseline gap-3 sm:col-span-3 sm:flex-col sm:items-start lg:col-span-2">
                  <span className="font-garamond text-[26px] sm:text-[30px] lg:text-[36px] font-normal leading-none tracking-tight text-foreground/85">
                    {paper.year}
                  </span>
                  <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/55 sm:mt-2">
                    {paper.venue}
                  </span>
                </div>

                {/* Right column: title + optional award chip + authors.
                    Arrow sits flush-right and slides on hover. */}
                <div className="col-span-12 sm:col-span-9 lg:col-span-10">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-garamond text-[19px] sm:text-[21px] lg:text-[24px] font-normal leading-[1.22] tracking-[-0.005em] text-foreground">
                        {paper.title}
                      </h3>
                      {paper.award && (
                        <span className="mt-3 inline-flex items-center rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-primary">
                          {paper.award}
                        </span>
                      )}
                      <p className="mt-3 font-instrument italic text-[13.5px] leading-[1.4] text-foreground/65">
                        {paper.authors}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="mt-1 shrink-0 text-[18px] text-foreground/35 transition-transform group-hover:translate-x-1 group-hover:text-primary"
                    >
                      →
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
