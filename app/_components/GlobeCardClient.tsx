"use client";

import dynamic from "next/dynamic";
import type { PartnerOrg } from "../_lib/partner-orgs";

// maplibre-gl touches window during map construction; client-only.
const PartnersGlobe = dynamic(
  () => import("./partners-globe/PartnersGlobe").then((m) => m.PartnersGlobe),
  { ssr: false },
);

/**
 * Empirical zoom fit for the MapLibre globe projection: at zoom z the
 * rendered sphere is ~140 * 2^z CSS px across (measured on the
 * Partners panel: zoom 1.4 → ~370 px sphere). Solve for the zoom that
 * makes the sphere fill ~85% of a square container so a slim margin
 * of space stays visible around the planet.
 */
function zoomForDiameter(diameter: number): number {
  return Math.log2((diameter * 0.85) / 140);
}

export function GlobeCardClient({
  orgs,
  diameter,
  interactive,
}: {
  orgs: PartnerOrg[];
  diameter: number;
  interactive: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-[16px] bg-[#0b0b19]"
      style={{ width: diameter, height: diameter }}
    >
      <PartnersGlobe
        organizations={orgs}
        initialZoom={zoomForDiameter(diameter)}
        interactive={interactive}
      />
    </div>
  );
}
