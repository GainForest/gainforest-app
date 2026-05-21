"use client";

import { useT } from "./LocaleProvider";

// "The world's first community-owned data commons for biodiversity." —
// editorial port of gainforest.earth's "Data Commons" hero.
//
// Sits on the INK band (the same dark surface as the integrated
// closing footer), so the page rhythm reads as: cream-hero,
// cream-choose, **DARK band**, cream pillars, …). The hero is split
// into a left "claim" column (eyebrow
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
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-10 px-6 py-16 sm:gap-12 sm:px-10 sm:py-20 lg:grid-cols-12 lg:items-center lg:gap-16 lg:px-16 lg:py-28">
        {/* Left: claim */}
        <div className="lg:col-span-6">
          <span className="font-instrument italic text-[14px] uppercase tracking-[0.18em] text-ink-foreground/55">
            {t("dataCommons.eyebrow")}
          </span>
          <h2 className="mt-5 font-garamond text-[32px] sm:text-[44px] lg:text-[60px] font-normal leading-[1.08] tracking-[-0.01em] text-ink-foreground sm:leading-[1.05]">
            {before && <span>{before} </span>}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && (after === "." ? after : <span> {after}</span>)}
          </h2>
          <p className="mt-6 max-w-[600px] text-[15px] sm:mt-7 sm:text-[15.5px] lg:text-[17px] leading-[1.6] text-ink-foreground/75 sm:leading-[1.55]">
            {t("dataCommons.body")}
          </p>
        </div>

        {/* Right: photo collage. Two photographs of the global
            community the data commons is built with — a community
            gathering inside an Indigenous maloca (with a drone
            taking off, the 'data' half of the commons) and field
            researchers wading through a mangrove forest (the
            'biodiversity' half).

            Composition: top photo anchors top-right, bottom photo
            anchors bottom-left and is intentionally shifted further
            left than the top photo so the pair reads as a single
            diagonal collage — the same arrangement
            gainforest.earth's DataCommons section uses. Hard
            rectangular edges (no rounded corners, no ring) keep the
            photos feeling like editorial prints rather than UI
            cards. A single soft drop shadow gives just enough lift
            against the ink band.

            The collage uses `overflow-visible` so the bottom photo
            can bleed slightly past the column's left edge on wide
            screens, the way the original does. On mobile the two
            photos stack with a generous negative-margin overlap
            preserved so they still read as one composition. */}
        <div className="lg:col-span-6">
          {/* On mobile the same diagonal collage idea is preserved
              without absolute positioning: the top photo right-
              aligns at ~88% width, and the bottom photo left-aligns
              at the same width with a percentage-based negative top
              margin (~14% of column width ≈ 24% of photo height,
              matching the desktop overlap). On lg+ we switch to
              absolute positioning inside an aspect-locked frame so
              the bottom photo can bleed left of the column edge. */}
          <div className="relative lg:aspect-[7/6]">
            {/* Top photo: community gathering inside the maloca. */}
            <img
              src="/data-commons/community-drone.webp"
              alt="Indigenous community gathering inside a maloca, launching a drone"
              loading="lazy"
              decoding="async"
              width={1599}
              height={1048}
              className="ml-auto block w-[88%] object-cover shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] sm:w-[82%] sm:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] lg:absolute lg:right-0 lg:top-0 lg:ml-0 lg:h-auto lg:w-[72%]"
            />
            {/* Bottom photo: field researchers wading through
                mangrove. Mobile: left-aligns at the same inset and
                overlaps the top photo with a percentage-based
                negative margin. Desktop: anchored bottom-left and
                shifted past the column edge.

                This photo was re-cropped (1500×828) from the
                original 1599×1066 to remove the heavy
                out-of-focus foreground leaves and the top tree
                branches that dominated the frame at small panel
                sizes — audit feedback called the previous version
                "a blurry green mass". The three field researchers
                are now the obvious subject. */}
            <img
              src="/data-commons/community-mangrove.webp"
              alt="Field researchers sampling water in a mangrove forest"
              loading="lazy"
              decoding="async"
              width={1500}
              height={828}
              className="-mt-[14%] mr-auto block w-[88%] object-cover shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] sm:-mt-[12%] sm:w-[82%] sm:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] lg:absolute lg:bottom-0 lg:left-[-6%] lg:mr-0 lg:mt-0 lg:h-auto lg:w-[70%]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
