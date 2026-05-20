"use client";

import Image from "next/image";
import { useT } from "./LocaleProvider";

// "Merci to our supporters." — port of gainforest.earth's closing
// supporter strip.
//
// Editorial monochrome wall (17 logos extracted from gainforest.earth):
//
//   Klarna · Milkywire · MA·EARTH · XPRIZE Rainforest+alana · Octant ·
//   Ethereum Foundation · Hypercerts · Fondation Valery ·
//   Filecoin Foundation · CELO · Gitcoin · Devonian · Climate Collective ·
//   Edge City · Glo Dollar · planet. · BKCF
//
// Visual treatment: each logo is rendered in monochrome at a uniform
// height, with subtle opacity, in a single flex-wrap. White
// backgrounds were stripped from the source PNGs so logos blend with
// cream; the `grayscale + brightness(0)` filter chain then collapses
// the remaining art into a single dark silhouette. The result is the
// "editorial logo wall" recipe Stripe / Vercel use — quietly
// authoritative, never shouty.
//
// Why monochrome vs. full-colour (gainforest.earth's choice): the
// upstream Canva-rendered site dedicates a full screen to the wall
// with generous breathing room around every mark. We don't have that
// kind of space mid-scroll, so a flat silhouette treatment lets the
// section read as one block instead of 17 competing brand colours.

type Logo = {
  src: string;
  alt: string;
  // Intrinsic dimensions for Next/Image. Rendered height is uniform
  // via CSS; width auto-derives from these.
  w: number;
  h: number;
};

// Order roughly mirrors gainforest.earth's row layout so the eye
// finds the "anchor" brands (Klarna, Ethereum Foundation, Filecoin)
// first.
const LOGOS: Logo[] = [
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

// Per-logo height tweaks. Some marks (BKCF stacked block, square
// icons, very-wide wordmarks) need a different optical height than a
// flat default to feel "weighted the same" as the rest. Heights are
// in pixels; logos not listed use H_BASE.
const H_BASE = 30;
const H_TWEAKS: Record<string, number> = {
  // Tall, stacked compositions read smaller per pixel — give them
  // more vertical room so the text reads.
  "bkcf.png": 52,
  "edge-city.png": 44,
  // The Ethereum diamond on the left of the wordmark needs slightly
  // more height to balance the wordmark on the right.
  "ethereum-foundation.png": 38,
  // (Hypercerts used to sit at h: 38 to give the framed icon room
  // to read; team feedback was "it's larger than the others", so it
  // now uses the base height like every other horizontal wordmark.)
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

function heightFor(src: string): number {
  const file = src.split("/").pop() ?? "";
  return H_TWEAKS[file] ?? H_BASE;
}

export function Supporters() {
  const t = useT();
  const before = t("supporters.heading.before").trim();
  const italic = t("supporters.heading.italic").trim();
  const after = t("supporters.heading.after").trim();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        {/* Heading + body on a tighter grid so the section reads as a
            quiet footer-style acknowledgement rather than a hero. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <h2 className="font-garamond text-[28px] sm:text-[34px] lg:text-[38px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span>{after}</span>}
            </h2>
          </div>
          <p className="text-[14.5px] lg:text-[15.5px] leading-[1.55] text-foreground/65 lg:col-span-5">
            {t("supporters.body")}
          </p>
        </div>

        {/* Monochrome editorial logo wall.
            - `mix-blend-mode: multiply` lets the cream page bleed
              through any residual light pixels and binds each logo
              to the page warmth.
            - `grayscale(1) contrast(1.05)` desaturates each mark but
              preserves *internal* brightness so wordmarks-inside-pills
              (Klarna) and rainbow gradients (Ethereum) still read as
              their original shape — they just turn neutral.
            - `opacity: 0.62` quiets the wall to a section accent;
              hover restores full presence for an unobtrusive moment
              of identity recognition. */}
        <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 lg:mt-16 lg:gap-x-14 lg:gap-y-10">
          {LOGOS.map((l) => {
            const renderH = heightFor(l.src);
            return (
              <li
                key={l.src}
                className="flex items-center justify-center"
                style={{ height: renderH }}
              >
                <Image
                  src={l.src}
                  alt={l.alt}
                  width={l.w}
                  height={l.h}
                  className="opacity-[0.62] transition-opacity duration-200 ease-out hover:opacity-100"
                  style={{
                    height: renderH,
                    width: "auto",
                    filter: "grayscale(1) contrast(1.05)",
                    mixBlendMode: "multiply",
                  }}
                  draggable={false}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
