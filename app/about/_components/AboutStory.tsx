"use client";

import { Fragment } from "react";
import { useLocale } from "../../_components/LocaleProvider";
import { getAboutT } from "../_messages";
import { TIMELINE, pickLocale } from "../_data";

// "From a 2017 UN hackathon to the Amazon." — editorial timeline of
// the seven moments that shaped GainForest. Two-column layout: each
// row is a year + title + one-sentence body, separated by hairline
// rules so the timeline reads as a quiet ledger rather than a busy
// vertical track of dots and lines.
//
// We avoided the "decorated vertical timeline" pattern (dots, lines,
// alternating sides) on purpose — it competes with the editorial
// typography and adds visual chrome the design system explicitly
// rejects. A clean tabular rhythm is enough.
export function AboutStory() {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  const before = t("about.story.heading.before").trim();
  const italic = t("about.story.heading.italic").trim();
  const after = t("about.story.heading.after").trim();

  return (
    <section
      id="story"
      className="scroll-mt-20 border-t border-border-soft bg-background lg:scroll-mt-24"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("about.story.eyebrow")}
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
            {t("about.story.subheading")}
          </p>
        </div>

        {/* Timeline list. Year in Cormorant Garamond on the left
            (anchored small column), title + body on the right. Each
            row uses a hairline top border so the whole thing reads
            as one ruled ledger. */}
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
