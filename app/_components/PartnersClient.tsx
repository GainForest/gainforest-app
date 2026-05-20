"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

type CommunityName = {
  name: string;
  country: string;
};

function uniqueCommunityNames(pins: ProjectPin[]): CommunityName[] {
  const seen = new Set<string>();
  const names: CommunityName[] = [];
  for (const pin of pins) {
    const name = pin.name.trim();
    if (!name) continue;
    const country = pin.country.trim();
    const key = `${name.toLocaleLowerCase()}|${country.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push({ name, country });
  }
  return names.sort((a, b) => a.name.localeCompare(b.name));
}

function CommunityRoster({
  names,
  recordLabel,
}: {
  names: CommunityName[];
  recordLabel: string;
}) {
  if (names.length === 0) return null;
  const visible = names.slice(0, 12);

  return (
    <div className="mt-10 rounded-[26px] border border-border-soft bg-background/55 p-3 sm:p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {visible.map((community, i) => (
          <div
            key={`${community.name}-${community.country}`}
            className="group flex min-h-[62px] items-center justify-between gap-4 border-b border-border-soft px-3 py-3 last:border-b-0 sm:px-4 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r"
          >
            <div className="min-w-0">
              <p className="truncate font-garamond text-[20px] leading-[1.05] text-foreground sm:text-[21px]">
                {community.name}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-foreground/38">
                {recordLabel}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border-soft bg-[#efe8d8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
              {community.country || String(i + 1).padStart(2, "0")}
            </span>
          </div>
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
  const rosterNames =
    communityNames.length > 0
      ? communityNames
      : pins.map((pin) => ({ name: pin.name, country: pin.country }));

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

            <div className="mt-9 flex items-center justify-between gap-4 border-y border-border-soft py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              <span>{t("partners.bannerLabel")}</span>
              <span>
                {communityNames.length || pins.length} {t("partners.bannerCountLabel")}
              </span>
            </div>
            <CommunityRoster names={rosterNames} recordLabel={t("partners.recordLabel")} />

            <Link
              href="https://www.youtube.com/@gainforest/videos"
              target="_blank"
              rel="noreferrer"
              className="group mt-5 flex max-w-[620px] items-center justify-between gap-5 rounded-[20px] border border-border-soft bg-background/70 px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-background"
            >
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                  {t("partners.callsEyebrow")}
                </span>
                <span className="mt-1 block font-garamond text-[22px] leading-[1.08] text-foreground sm:text-[24px]">
                  {t("partners.callsTitle")}
                </span>
                <span className="mt-2 block text-[13px] leading-[1.45] text-foreground/62">
                  {t("partners.callsBody")}
                </span>
              </span>
              <span
                aria-hidden
                className="shrink-0 text-[22px] text-primary transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
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
