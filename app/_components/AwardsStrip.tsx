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
//   │ Recognised by [Earthshot] [Eth Foundation] [Filecoin]       │
//   │               [Solana] [Klarna] [BCG / Handelsblatt]        │
//   └─────────────────────────────────────────────────────────────┘
//
// All logos are rendered in monochrome at a uniform height. The
// XPRIZE primary line uses a larger logo size; the secondary
// recognitions sit smaller in a flex-wrap row.
//
// Why monochrome vs. full-colour: the band sits directly under the
// cream hero on a cream background. Six full-colour logos would
// compete with the hero copy above. Flat silhouette treatment keeps
// the band reading as one quiet block — same recipe as the
// `<Supporters />` wall further down.

type Logo = {
  src: string;
  alt: string;
  href: string;
  // Display height in px. Tuned per-logo so optical weight is balanced
  // even though widths vary wildly. Larger numbers for stacked/short
  // marks (Klarna pill, BKCF block), smaller for very-long wordmarks.
  h: number;
};

const PRIMARY_LOGO: Logo = {
  src: "/decor/supporters/xprize-rainforest.png",
  alt: "XPRIZE Rainforest (with alana)",
  href: "https://www.xprize.org/competitions/rainforest",
  h: 42,
};

const SECONDARY_LOGOS: ReadonlyArray<Logo> = [
  {
    src: "/decor/awards/earthshot.svg",
    alt: "Earthshot Prize",
    href: "https://earthshotprize.org/",
    h: 34,
  },
  {
    src: "/decor/supporters/ethereum-foundation.png",
    alt: "Ethereum Foundation",
    href: "https://ethereum.foundation/",
    h: 28,
  },
  {
    src: "/decor/supporters/filecoin-foundation.png",
    alt: "Filecoin Green",
    href: "https://green.filecoin.io/",
    h: 24,
  },
  {
    src: "/decor/awards/solana.svg",
    alt: "Solana",
    href: "https://solana.com/",
    h: 18,
  },
  {
    src: "/decor/supporters/klarna.png",
    alt: "Klarna",
    href: "https://www.klarna.com/",
    h: 28,
  },
  {
    // The "BCG & Handelsblatt Vordenker:innen" recognition is a joint
    // press initiative; using just BCG's logo is the cleaner read
    // (Handelsblatt's mark on its own would frame this as a newspaper
    // mention rather than a strategy-prize recognition). The link
    // still points to the Handelsblatt feature page so the source is
    // discoverable.
    src: "/decor/awards/bcg.svg",
    alt: "BCG & Handelsblatt Vordenker:innen",
    href: "https://www.handelsblatt.com/unternehmen/management/vordenker_innen/vordenker-ernaehrung-und-landwirtschaft-besser-essen-fuer-das-weltklima/28848280.html",
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
            <a
              href={PRIMARY_LOGO.href}
              target="_blank"
              rel="noreferrer"
              aria-label={PRIMARY_LOGO.alt}
              className="inline-flex items-center transition-opacity hover:opacity-80"
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
            </a>
          </div>

          {/* Secondary — Recognised by + logos */}
          <div className="flex flex-col gap-3 lg:items-end">
            <span className="font-instrument italic text-[13px] lg:text-[14px] text-foreground/45">
              {t("awards.alsoLabel")}
            </span>
            <ul
              className="flex flex-wrap items-center gap-x-7 gap-y-3 lg:justify-end lg:gap-x-8"
              role="list"
            >
              {SECONDARY_LOGOS.map((l) => (
                <li
                  key={l.src}
                  className="flex items-center"
                  style={{ height: l.h }}
                >
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={l.alt}
                    className="inline-flex items-center transition-opacity hover:opacity-100"
                    style={{ height: l.h }}
                  >
                    {/* `grayscale + multiply` collapses brand colours
                        into a single neutral silhouette while
                        preserving wordmark legibility. Hover restores
                        full presence. */}
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
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
