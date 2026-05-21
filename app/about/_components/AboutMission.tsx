"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getAboutT } from "../_messages";
import { EXTERNAL } from "../_data";

// "Scaling human cooperation through trustworthy machines." — the
// mission / regenerative-intelligence section. Two-column editorial
// layout: italic eyebrow + headline on the left, two body paragraphs
// on the right.
//
// Sits on the INK band (the same dark surface as DataCommons on the
// landing) so the about page picks up the cream → ink → cream
// rhythm the team has approved as the page's only allowed dark
// punch outside the closing footer.
export function AboutMission() {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  const before = t("about.mission.heading.before").trim();
  const italic = t("about.mission.heading.italic").trim();
  const after = t("about.mission.heading.after").trim();

  return (
    <section
      id="mission"
      className="scroll-mt-20 bg-ink text-ink-foreground lg:scroll-mt-24"
    >
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-10 px-6 py-16 sm:px-10 sm:py-20 lg:grid-cols-12 lg:items-start lg:gap-16 lg:px-16 lg:py-28">
        <div className="lg:col-span-6">
          <span className="font-instrument italic text-[14px] uppercase tracking-[0.18em] text-ink-foreground/55">
            {t("about.mission.eyebrow")}
          </span>
          <h2 className="mt-5 font-garamond text-[32px] sm:text-[44px] lg:text-[58px] font-normal leading-[1.06] tracking-[-0.01em] text-ink-foreground">
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

        <div className="lg:col-span-6">
          <p className="text-[16px] lg:text-[17.5px] leading-[1.6] text-ink-foreground/80">
            {t("about.mission.body1")}
          </p>
          <p className="mt-5 text-[15px] lg:text-[16.5px] leading-[1.6] text-ink-foreground/72">
            {t("about.mission.body2")}
          </p>
          <Link
            href={EXTERNAL.essay}
            target="_blank"
            rel="noreferrer"
            className="group mt-8 inline-flex items-center gap-2 text-[14px] font-medium text-ink-foreground transition-colors hover:text-brand"
          >
            {t("about.mission.readEssay")}
            <span
              aria-hidden
              className="text-ink-foreground/40 transition-transform group-hover:translate-x-1 group-hover:text-brand"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
