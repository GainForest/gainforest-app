"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT } from "../_messages";
import { EXTERNAL } from "../_data";

// "All of this builds toward one idea; regenerative intelligence." —
// bridge between the research content and the shared Footer. Cream-
// on-cream editorial stripe with a single sage primary pill pointing
// at the long-form essay + an understated text link to email the
// research team. Quiet on purpose so the dark Footer that follows
// has room to land.
export function ResearchClosing() {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  const before = t("research.closing.heading.before").trim();
  const italic = t("research.closing.heading.italic").trim();
  const after = t("research.closing.heading.after").trim();

  return (
    <section
      aria-label="Read the theory"
      className="border-t border-border-soft bg-background"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("research.closing.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[34px] sm:text-[44px] lg:text-[56px] font-normal leading-[1.06] tracking-[-0.01em] text-foreground">
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
            <p className="mt-5 max-w-[560px] text-[15.5px] lg:text-[17px] leading-[1.6] text-foreground/75">
              {t("research.closing.body")}
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 lg:col-span-5 lg:items-end">
            <Link
              href={EXTERNAL.essay}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex h-[54px] items-center justify-center gap-2 rounded-full bg-primary px-8 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark lg:px-10 lg:text-[16px]"
            >
              {t("research.closing.essay")}
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <Link
              href={`mailto:${EXTERNAL.email}`}
              className="group inline-flex items-center gap-2 text-[14px] text-foreground/72 transition-colors hover:text-primary"
            >
              {t("research.closing.contact")}
              <span
                aria-hidden
                className="text-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              >
                →
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
