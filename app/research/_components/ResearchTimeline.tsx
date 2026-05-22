"use client";

import { Fragment } from "react";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT } from "../_messages";
import { TIMELINE, pickLocale } from "../_data";

// "From a single prototype to a research practice." — editorial
// timeline of the research arc. Same ledger pattern as
// <AboutStory />: year on the left, title + one-sentence body on the
// right, hairline rules between rows. Distinct from AboutStory in
// that each entry is meant to map to an artefact in the publications
// carousel below, so readers can pivot from a moment to the paper.
export function ResearchTimeline() {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  const before = t("research.timeline.heading.before").trim();
  const italic = t("research.timeline.heading.italic").trim();
  const after = t("research.timeline.heading.after").trim();

  return (
    <section
      id="timeline"
      className="scroll-mt-20 border-t border-border-soft bg-background lg:scroll-mt-24"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("research.timeline.eyebrow")}
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
            {t("research.timeline.subheading")}
          </p>
        </div>

        <ol
          role="list"
          className="mt-12 border-t border-border-soft lg:mt-16"
        >
          {TIMELINE.map((rawEntry, i) => {
            const entry = pickLocale(rawEntry, locale);
            return (
              <li
                key={`${entry.year}-${i}`}
                className="grid grid-cols-12 gap-6 border-b border-border-soft py-8 sm:gap-10 lg:py-10"
              >
                <div className="col-span-12 sm:col-span-3 lg:col-span-2">
                  <span className="font-garamond text-[26px] sm:text-[30px] lg:text-[36px] font-normal leading-none tracking-tight text-foreground/80">
                    {entry.year}
                  </span>
                </div>
                <div className="col-span-12 sm:col-span-9 lg:col-span-10">
                  <h3 className="font-garamond text-[22px] sm:text-[26px] lg:text-[30px] font-normal leading-[1.15] tracking-[-0.005em] text-foreground">
                    {entry.title}
                  </h3>
                  <p className="mt-3 max-w-[760px] text-[15px] lg:text-[16px] leading-[1.6] text-foreground/72">
                    {entry.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
