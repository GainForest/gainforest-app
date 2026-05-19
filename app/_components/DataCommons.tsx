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

        {/* Right: photo collage. Two photographs of the global
            community the data commons is built with — a community
            gathering inside an Indigenous maloca (with a drone
            taking off, the 'data' half of the commons) and field
            researchers wading through a mangrove forest (the
            'biodiversity' half). They overlap intentionally to read
            as a single composition rather than a 2-up grid.

            On mobile the two photos stack vertically with a small
            negative-margin overlap that preserves the editorial
            collage feel without depending on absolute positioning. */}
        <div className="lg:col-span-5">
          <div className="relative lg:aspect-[5/6]">
            {/* Top photo: community gathering. On desktop it anchors
                top-right at ~80% width; on mobile it's just block-
                level. The thin cream/8% ring keeps the photo edge
                visible against the ink band without competing with
                the photo content. */}
            <img
              src="/data-commons/community-drone.webp"
              alt="Indigenous community gathering inside a maloca, launching a drone"
              loading="lazy"
              decoding="async"
              width={1599}
              height={1048}
              className="block w-full rounded-md object-cover ring-1 ring-ink-foreground/8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)] lg:absolute lg:right-0 lg:top-0 lg:h-auto lg:w-[82%]"
            />
            {/* Bottom photo: field researchers in mangrove. Offset
                down-and-left so it overlaps the top photo. Slight
                negative top margin on mobile gives the same overlap
                feel without absolute positioning. */}
            <img
              src="/data-commons/community-mangrove.webp"
              alt="Field researchers wading through a mangrove forest"
              loading="lazy"
              decoding="async"
              width={1599}
              height={1066}
              className="-mt-6 block w-full rounded-md object-cover ring-1 ring-ink-foreground/8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)] sm:-mt-10 lg:absolute lg:bottom-0 lg:left-0 lg:mt-0 lg:h-auto lg:w-[80%]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
