"use client";

import { useEffect, useState } from "react";
import { LiveGlobe } from "./LiveGlobe";
import { useT } from "./LocaleProvider";
import type { ProjectPin } from "../_lib/projects";

// Client child of <Partners />. Renders the editorial copy on the left
// and a large, slowly-rotating LiveGlobe on the right — swapping out
// the previous "50+" pull number for the actual live globe of project
// pins. Gainforest.earth's equivalent section also leads with imagery
// (a video B-roll wall), so replacing the static stat with the live
// globe reads as a stronger expression of the same idea: "we work
// with stewards … here they are."
//
// Globe diameter is responsive (read from a ResizeObserver on the
// container) so the sphere always fills its column without overflowing
// at narrow viewport widths.

function uniqueCommunityNames(pins: ProjectPin[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const pin of pins) {
    const name = pin.name.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function CommunityNameRail({
  names,
  reverse = false,
}: {
  names: string[];
  reverse?: boolean;
}) {
  const loop = [...names, ...names, ...names];
  if (loop.length === 0) return null;

  return (
    <div className="partners-name-rail" data-reverse={reverse ? "true" : "false"}>
      <div className="partners-name-track">
        {loop.map((name, i) => (
          <span key={`${name}-${i}`} className="partners-name-pill">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ClientPartners({ pins }: { pins: ProjectPin[] }) {
  const t = useT();
  const before = t("partners.heading.before").trim();
  const italic = t("partners.heading.italic").trim();
  const after = t("partners.heading.after").trim();

  const communityNames = uniqueCommunityNames(pins);
  const marqueeNames = communityNames.length > 0 ? communityNames : pins.map((pin) => pin.name);
  const firstRow = marqueeNames.filter((_, i) => i % 2 === 0);
  const secondRow = marqueeNames.filter((_, i) => i % 2 === 1);

  // Responsive globe diameter — sized to comfortably fit inside the
  // right column without overflowing the section. The previous tier
  // (420–480 px) over-filled the slot and visually clipped at the
  // top edge of the next section, so the sphere read as cropped in
  // half. Smaller tier numbers below; LiveGlobe still draws at the
  // requested diameter, just within bounds.
  const [diameter, setDiameter] = useState<number>(360);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setDiameter(400);
      else if (w >= 1024) setDiameter(360);
      else if (w >= 640) setDiameter(340);
      else setDiameter(Math.min(320, w - 64));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          {/* Left column — editorial copy + archetype ledger. */}
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("partners.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[40px] lg:text-[48px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span>{after}</span>}
            </h2>
            <p className="mt-6 max-w-[600px] text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70">
              {t("partners.body")}
            </p>

            {/* Inline stat — kept as a quiet pull line beneath the
                body. The big number is gone; the live globe carries
                the visual weight now. */}
            <p className="mt-6 flex items-baseline gap-3 text-[14px] text-foreground/55">
              <span className="font-garamond text-[32px] font-normal leading-none tracking-[-0.01em] text-foreground/85">
                {communityNames.length || pins.length}
              </span>
              <span className="font-instrument italic text-[14.5px] text-foreground/65">
                {t("partners.statLabel")}
              </span>
            </p>

            <div className="mt-10 overflow-hidden rounded-[28px] border border-border-soft bg-[#efe8d8] py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
              <div className="mb-3 flex items-center justify-between gap-4 px-5 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                <span>{t("partners.bannerLabel")}</span>
                <span>
                  {communityNames.length || pins.length} {t("partners.bannerCountLabel")}
                </span>
              </div>
              <CommunityNameRail names={firstRow} />
              {secondRow.length > 0 ? (
                <CommunityNameRail names={secondRow} reverse />
              ) : null}
            </div>
          </div>

          {/* Right column — rotating LiveGlobe. Same dataset as the
              hero globe; rendered inside an explicit square frame so
              the sphere is fully visible and the live caption sits
              under it without bleeding into the next section. */}
          <div className="lg:col-span-5 lg:flex lg:items-center lg:justify-center">
            <div
              className="relative mx-auto flex flex-col items-center justify-center"
              style={{ width: diameter }}
            >
              <LiveGlobe pins={pins} diameter={diameter} />
              {/* Live caption beneath the globe — mirrors the
                  gainforest.app pin so the source of truth is
                  clear. Sits inside the column flow now (not
                  absolute) so it can't be clipped by the next
                  section's top edge. */}
              <span className="mt-3 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                gainforest.app · live pins
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
