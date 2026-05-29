"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

// "We research and innovate together." — small editorial section that
// mirrors gainforest.earth's hackathon block.
//
// Single full-width band on cream. Eyebrow + serif headline with italic
// "innovate" word + body + two CTAs: the internal research route from
// the navbar, plus the public 2024 AI+Environment EcoHackathon wiki.
// Deliberately compact so the preceding TainaFeature and the following
// NatureGuild get more vertical breathing room.
const RESEARCH_URL = "/research";
const HACKATHON_URL =
  "https://gainforest.notion.site/AI-Environment-Hackathon-2024-Wiki-27f7f5459ea743b2bec1b9b11af54ef4?pvs=74";

export function Research() {
  const t = useT();
  const before = t("research.heading.before").trim();
  const italic = t("research.heading.italic").trim();
  const after = t("research.heading.after").trim();
  return (
    <section id="research" className="scroll-mt-20 border-t border-border-soft lg:scroll-mt-24">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("research.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[40px] lg:text-[48px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span> {after}</span>}
            </h2>
          </div>
          <div className="lg:col-span-5">
            <p className="text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70">
              {t("research.body")}
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link
                href={RESEARCH_URL}
                className="group inline-flex h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-7 text-[14.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
              >
                {t("research.cta")}
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
              <a
                href={HACKATHON_URL}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex h-[48px] items-center justify-center gap-2 rounded-full border border-foreground/25 px-7 text-[14.5px] font-medium text-foreground transition-colors hover:border-foreground/60"
              >
                {t("research.hackathonCta")}
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  ↗
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
