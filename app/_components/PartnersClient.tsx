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

// Archetypes — same list as the previous stat-driven version; kept as
// a quiet editorial ledger below the body copy so readers still see
// the kinds of partners we work with at a glance.
const PARTNER_ARCHETYPES = [
  "Indigenous Councils",
  "Grassroots Cooperatives",
  "Ecological Labs",
  "Protected-Area Managers",
  "Academic Partners",
  "Climate Funds",
];

export function ClientPartners({ pins }: { pins: ProjectPin[] }) {
  const t = useT();
  const before = t("partners.heading.before").trim();
  const italic = t("partners.heading.italic").trim();
  const after = t("partners.heading.after").trim();

  // Responsive globe diameter — sized to fit a 5-column slot on
  // desktop (~420px), single column on mobile (cap at viewport - some
  // padding). We use a window resize listener rather than
  // ResizeObserver because the container width is purely a function
  // of viewport (no parent reflow drama on this section).
  const [diameter, setDiameter] = useState<number>(420);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setDiameter(480);
      else if (w >= 1024) setDiameter(420);
      else if (w >= 640) setDiameter(380);
      else setDiameter(Math.min(340, w - 64));
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
                {t("partners.stat")}
              </span>
              <span className="font-instrument italic text-[14.5px] text-foreground/65">
                {t("partners.statLabel")}
              </span>
            </p>

            <ul className="mt-10 grid grid-cols-1 gap-y-1 sm:grid-cols-2 sm:gap-x-12">
              {PARTNER_ARCHETYPES.map((p, i) => (
                <li
                  key={p}
                  className="flex items-baseline justify-between border-b border-foreground/15 py-3"
                >
                  <span className="text-[14px] lg:text-[15px] text-foreground/80">
                    {p}
                  </span>
                  <span className="font-instrument italic text-[12px] text-foreground/45">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right column — large rotating LiveGlobe. Same dataset as
              the hero globe; rendered larger here so it dominates the
              column the way the "50+" stat used to. */}
          <div className="lg:col-span-5 lg:flex lg:items-center lg:justify-end">
            <div className="relative mx-auto">
              <LiveGlobe pins={pins} diameter={diameter} />
              {/* Live caption beneath the globe — mirrors the
                  gainforest.app pin so the source of truth is clear. */}
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                gainforest.app · live pins
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
