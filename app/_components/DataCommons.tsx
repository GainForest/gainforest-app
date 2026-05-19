"use client";

import { useT } from "./LocaleProvider";

// "The world's first community-owned data commons for biodiversity." —
// editorial port of gainforest.earth's "Data Commons" hero.
//
// Sits on the INK band (same dark band as NatureCTA + Footer use, so the
// page rhythm reads as: cream-hero, cream-choose, **DARK band**, cream
// pillars, …). The hero is split into a left "claim" column (eyebrow
// + serif headline with a single italic word + body) and a right
// "stat" column where the 1% figure lives.
//
// We don't generate a raster decoration here. AGENTS.md's rule #6 — no
// thin-stroke decorative art — applies to dark sections too, and the
// 1% stat is doing the visual work on its own.
export function DataCommons() {
  const t = useT();
  const before = t("dataCommons.heading.before").trim();
  const italic = t("dataCommons.heading.italic").trim();
  const after = t("dataCommons.heading.after").trim();
  return (
    <section className="bg-ink text-ink-foreground">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-12 px-6 py-20 sm:px-10 lg:grid-cols-12 lg:gap-16 lg:px-16 lg:py-28">
        {/* Left: claim */}
        <div className="lg:col-span-7">
          <span className="font-instrument italic text-[14px] uppercase tracking-[0.18em] text-ink-foreground/55">
            {t("dataCommons.eyebrow")}
          </span>
          <h2 className="mt-5 font-garamond text-[36px] sm:text-[44px] lg:text-[60px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-foreground">
            {before && <span>{before} </span>}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && (after === "." ? after : <span> {after}</span>)}
          </h2>
          <p className="mt-7 max-w-[600px] text-[15.5px] lg:text-[17px] leading-[1.55] text-ink-foreground/75">
            {t("dataCommons.body")}
          </p>
        </div>

        {/* Right: stat. The 1% figure sits in a tall serif so it
            reads as an editorial pull quote rather than a UI badge.
            We keep the number cream, not mint: AGENTS.md restricts the
            brand mint to the logo and tiny live-data accents, and this
            pull-stat is intentionally large. */}
        <div className="lg:col-span-5 lg:flex lg:items-end lg:justify-end">
          <div className="flex flex-col gap-3 lg:items-end lg:text-right">
            <span
              aria-hidden
              className="font-garamond text-[112px] sm:text-[140px] lg:text-[180px] font-normal leading-[0.9] tracking-[-0.02em] text-ink-foreground"
            >
              {t("dataCommons.stat.value")}
            </span>
            <p className="max-w-[300px] text-[14px] lg:text-[14.5px] leading-[1.5] text-ink-foreground/70 lg:max-w-[280px]">
              {t("dataCommons.stat.label")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
