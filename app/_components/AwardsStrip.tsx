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
// recognitions drift slowly from right to left in a continuous CSS
// marquee so the wall stays calm + alive as more recognitions are
// added. The marquee pauses on hover / keyboard focus, and respects
// `prefers-reduced-motion` (defined in `app/globals.css`).
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

          {/* Secondary — Recognised by + auto-scrolling logo marquee */}
          <div className="flex min-w-0 flex-col gap-3 lg:flex-1 lg:items-end">
            <span className="font-instrument italic text-[13px] lg:text-[14px] text-foreground/45">
              {t("awards.alsoLabel")}
            </span>
            <div className="relative w-full max-w-full lg:max-w-[720px]">
              <div
                className="awards-marquee py-1"
                role="region"
                aria-label={t("awards.alsoLabel")}
              >
                <ul
                  className="awards-marquee-track"
                  role="list"
                  aria-label={t("awards.alsoLabel")}
                >
                  {/* First copy — the accessible one. */}
                  {SECONDARY_LOGOS.map((l) => (
                    <LogoItem key={l.src} logo={l} />
                  ))}
                  {/* Duplicate copy — hidden from screen readers; lives
                      purely to make the marquee loop seamlessly when
                      the track translates -50%. */}
                  {SECONDARY_LOGOS.map((l) => (
                    <LogoItem key={`dup-${l.src}`} logo={l} ariaHidden />
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Single logo cell in the marquee. Uses `mr-7 lg:mr-8` (not flex
// `gap`) so that EVERY item has a trailing margin — including the
// last item of each copy. That uniform trailing margin is what makes
// the `translateX(-50%)` keyframe end up perfectly aligned with the
// first frame: A's last gap == the gap between A's end and B's start.
function LogoItem({
  logo,
  ariaHidden,
}: {
  logo: Logo;
  ariaHidden?: boolean;
}) {
  return (
    <li
      aria-hidden={ariaHidden}
      className="mr-7 flex shrink-0 items-center lg:mr-8"
      style={{ height: logo.h }}
    >
      {/* `grayscale + multiply` collapses brand colours into a single
          neutral silhouette while preserving wordmark legibility. The
          logos are deliberately not links: this strip is a calm
          credibility cue, not a navigation surface. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={ariaHidden ? "" : logo.alt}
        style={{
          height: logo.h,
          width: "auto",
          filter: "grayscale(1) contrast(1.05)",
          mixBlendMode: "multiply",
          opacity: 0.7,
        }}
        draggable={false}
      />
    </li>
  );
}
