"use client";

import Image from "next/image";
import { useT } from "./LocaleProvider";

// "Winners of …" strip — port of gainforest.earth's award badge band
// that sits directly below the hero.
//
// Originally shipped as text-only ("XPRIZE Rainforest" wordmark + a row
// of secondary text labels). The team's feedback: "no logos, really?"
// — they wanted real recognisable logos in this band, not a quiet
// editorial typography treatment.
//
// New layout:
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │ Winners of [XPRIZE LOGO]                                    │
//   │                                                              │
//   │ Recognised by [Earthshot] [WEF] [Eth Foundation]            │
//   │               [Filecoin] [Solana] [Klarna] [BCG]            │
//   └─────────────────────────────────────────────────────────────┘
//
// All logos are rendered as inert, non-clickable marks in monochrome.
// The XPRIZE primary line uses a larger logo size; the secondary
// recognitions sit in a single-row overflow carousel so the wall stays
// calm as more recognitions are added.
//
// Why monochrome vs. full-colour: the band sits directly under the
// cream hero on a cream background. Full-colour logos would compete
// with the hero copy above. Flat silhouette treatment keeps the band
// reading as one quiet block — same recipe as the `<Supporters />` wall
// further down.

type Logo = {
  src: string;
  alt: string;
  // Display height in px. Tuned per-logo so optical weight is balanced
  // even though widths vary wildly. Larger numbers for stacked/short
  // marks (Klarna pill, BKCF block), smaller for very-long wordmarks.
  h: number;
};

const PRIMARY_LOGO: Logo = {
  src: "/decor/supporters/xprize-rainforest.png",
  alt: "XPRIZE Rainforest (with alana)",
  h: 42,
};

const SECONDARY_LOGOS: ReadonlyArray<Logo> = [
  {
    src: "/decor/awards/earthshot.svg",
    alt: "Earthshot Prize",
    h: 34,
  },
  {
    src: "/decor/awards/world-economic-forum.svg",
    alt: "World Economic Forum",
    h: 32,
  },
  {
    src: "/decor/supporters/ethereum-foundation.png",
    alt: "Ethereum Foundation",
    h: 28,
  },
  {
    src: "/decor/supporters/filecoin-foundation.png",
    alt: "Filecoin Green",
    h: 24,
  },
  {
    src: "/decor/awards/solana.svg",
    alt: "Solana",
    h: 18,
  },
  {
    src: "/decor/supporters/klarna.png",
    alt: "Klarna",
    h: 28,
  },
  {
    // The "BCG & Handelsblatt Vordenker:innen" recognition is a joint
    // press initiative; using just BCG's logo is the cleaner read
    // (Handelsblatt's mark on its own would frame this as a newspaper
    // mention rather than a strategy-prize recognition).
    src: "/decor/awards/bcg.svg",
    alt: "BCG & Handelsblatt Vordenker:innen",
    h: 26,
  },
];

export function AwardsStrip() {
  const t = useT();
  return (
    <section
      aria-label="Awards"
      className="border-t border-border-soft bg-background"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-10 sm:px-10 lg:py-14 lg:px-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          {/* Primary — Winners of XPRIZE Rainforest */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <span className="font-instrument italic text-[15px] lg:text-[16px] text-foreground/55">
              {t("awards.label")}
            </span>
            <span
              className="inline-flex items-center"
              style={{ height: PRIMARY_LOGO.h }}
            >
              <Image
                src={PRIMARY_LOGO.src}
                alt={PRIMARY_LOGO.alt}
                width={796}
                height={138}
                style={{ height: PRIMARY_LOGO.h, width: "auto" }}
                className="opacity-90"
                draggable={false}
              />
            </span>
          </div>

          {/* Secondary — Recognised by + logos */}
          <div className="flex min-w-0 flex-col gap-3 lg:flex-1 lg:items-end">
            <span className="font-instrument italic text-[13px] lg:text-[14px] text-foreground/45">
              {t("awards.alsoLabel")}
            </span>
            <div className="relative w-full max-w-full lg:max-w-[720px]">
              <ul
                className="awards-logo-carousel flex snap-x snap-mandatory items-center gap-x-7 overflow-x-auto overscroll-x-contain whitespace-nowrap px-8 py-1 lg:gap-x-8"
                role="list"
                aria-label={t("awards.alsoLabel")}
              >
                {SECONDARY_LOGOS.map((l) => (
                  <li
                    key={l.src}
                    className="flex shrink-0 snap-center items-center"
                    style={{ height: l.h }}
                  >
                    {/* `grayscale + multiply` collapses brand colours
                        into a single neutral silhouette while
                        preserving wordmark legibility. The logos are
                        deliberately not links: this strip is a calm
                        credibility cue, not a navigation surface. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.src}
                      alt={l.alt}
                      style={{
                        height: l.h,
                        width: "auto",
                        filter: "grayscale(1) contrast(1.05)",
                        mixBlendMode: "multiply",
                        opacity: 0.7,
                      }}
                      draggable={false}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
