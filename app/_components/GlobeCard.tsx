import Link from "next/link";
import { fetchPartnerOrgs } from "../_lib/partner-orgs";
import { GAINFOREST_APP_HOST, GLOBE_URL } from "../_lib/urls";
import { GlobeCardClient } from "./GlobeCardClient";

const DEFAULT_DIAMETER = 380;

/**
 * Floating globe used in the hero composition and the ChoosePath
 * preview.
 *
 * July 2026: swapped from the react-globe.gl dotted sphere to the same
 * MapLibre globe the Partners section runs (the port of the merged
 * app's /globe view — satellite sphere, space halo, one circular logo
 * badge per organization). Data is the full Ma Earth + GainForest
 * roster from `fetchPartnerOrgs()`, so every globe on the site plots
 * the same ~680 pinned orgs.
 *
 * Still an async server component: the roster fetch stays on the
 * server (page-level `revalidate` covers it); the client child mounts
 * the maplibre canvas.
 */
export async function GlobeCard({
  diameter = DEFAULT_DIAMETER,
  caption = true,
  interactive = false,
}: {
  diameter?: number;
  caption?: boolean;
  /** Pass through to the globe. When true it accepts drag + control
   *  pills; default is a frozen decorative widget that only spins. */
  interactive?: boolean;
} = {}) {
  const orgs = await fetchPartnerOrgs();
  return (
    <div className="relative" style={{ width: diameter, height: diameter }}>
      <GlobeCardClient orgs={orgs} diameter={diameter} interactive={interactive} />
      {caption && (
        <Link
          href={GLOBE_URL}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.18em] text-white/60 transition-colors hover:text-white"
        >
          {GAINFOREST_APP_HOST}/globe · live globe →
        </Link>
      )}
    </div>
  );
}
