// Canonical supporter logo list.
//
// Shared between `app/_components/Supporters.tsx` (landing's closing
// "Merci to our supporters." wall) and
// `app/about/_components/AboutRecognition.tsx` (About page's
// recognition wall). Extracted from Supporters.tsx so both surfaces
// stay in lockstep — adding a logo here surfaces it on both pages
// without forgetting one.
//
// Per-logo height tweaks live here too: some marks (BKCF stacked
// block, Klarna pill, Ethereum diamond+wordmark) need a different
// optical height than the flat default to feel weighted the same
// as the rest of the wall. Heights are in pixels.

export type SupporterLogo = {
  src: string;
  alt: string;
  /** Intrinsic source dimensions for Next/Image. Rendered height is
   *  uniform via CSS; width auto-derives from these. */
  w: number;
  h: number;
};

// Order roughly mirrors gainforest.earth's row layout so the eye
// finds the "anchor" brands (Klarna, Ethereum Foundation, Filecoin)
// first.
export const SUPPORTER_LOGOS: ReadonlyArray<SupporterLogo> = [
  { src: "/decor/supporters/klarna.png", alt: "Klarna", w: 798, h: 336 },
  { src: "/decor/supporters/milkywire.png", alt: "Milkywire", w: 400, h: 104 },
  { src: "/decor/supporters/ma-earth.png", alt: "MA·EARTH", w: 398, h: 84 },
  { src: "/decor/supporters/xprize-rainforest.png", alt: "XPRIZE Rainforest & alana", w: 796, h: 138 },
  { src: "/decor/supporters/octant.svg", alt: "Octant", w: 451, h: 120 },
  { src: "/decor/supporters/ethereum-foundation.png", alt: "Ethereum Foundation", w: 651, h: 200 },
  { src: "/decor/supporters/hypercerts.svg", alt: "Hypercerts", w: 1929, h: 340 },
  { src: "/decor/supporters/fondation-valery.png", alt: "Fondation Valery", w: 664, h: 183 },
  { src: "/decor/supporters/filecoin-foundation.png", alt: "Filecoin Foundation", w: 797, h: 247 },
  { src: "/decor/supporters/celo.png", alt: "CELO", w: 788, h: 178 },
  { src: "/decor/supporters/gitcoin.png", alt: "Gitcoin", w: 631, h: 216 },
  { src: "/decor/supporters/devonian.png", alt: "Devonian", w: 799, h: 111 },
  { src: "/decor/supporters/climate-collective.png", alt: "Climate Collective", w: 761, h: 241 },
  { src: "/decor/supporters/edge-city.png", alt: "Edge City", w: 297, h: 168 },
  { src: "/decor/supporters/glo-dollar.png", alt: "Glo Dollar", w: 320, h: 63 },
  { src: "/decor/supporters/planet.png", alt: "planet.", w: 300, h: 147 },
  { src: "/decor/supporters/bkcf.png", alt: "BKCF; BIMP-EAGA-ROK Cooperation Fund", w: 210, h: 171 },
];

const H_BASE = 30;
const H_TWEAKS: Record<string, number> = {
  // Tall, stacked compositions read smaller per pixel — give them
  // more vertical room so the text reads.
  "bkcf.png": 52,
  "edge-city.png": 44,
  // The Ethereum diamond on the left of the wordmark needs slightly
  // more height to balance the wordmark on the right.
  "ethereum-foundation.png": 38,
  // Klarna's pink pill has lots of internal padding around its
  // wordmark, so the visible letters end up smaller than peers.
  "klarna.png": 38,
  // CELO's chunky block lettering is visually heavier — shrink so it
  // doesn't dominate.
  "celo.png": 26,
  // Devonian is a very long thin wordmark — bumping it up reads as
  // shouting; keep it small.
  "devonian.png": 22,
  // Hairline / thin-stroke logos that disappear at the base height.
  "glo-dollar.png": 24,
};

export function supporterHeightFor(src: string): number {
  const file = src.split("/").pop() ?? "";
  return H_TWEAKS[file] ?? H_BASE;
}
