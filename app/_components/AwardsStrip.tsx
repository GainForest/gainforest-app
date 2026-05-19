"use client";

import { useT } from "./LocaleProvider";

// "Winners of …" strip — port of gainforest.earth's award badge band
// that sits directly below the hero.
//
// The original site renders raster logo PNGs (XPRIZE, Lever for Change,
// SwissTech, etc). We don't have permission to ship those assets and a
// chunky raster logo wall would clash with the editorial cream tone the
// team locked down for the rest of the page. So we use the same
// editorial treatment the rest of the landing uses: a small italic
// "Winners of" label, then the award names rendered as quiet serif
// typography next to a 1px hairline rule.
//
// Award copy comes verbatim from gainforest.earth's award strip (the
// names are proper nouns and don't translate). The label around them
// is localised via i18n.
const PRIMARY_AWARDS: ReadonlyArray<{ label: string; href: string }> = [
  {
    label: "XPRIZE Rainforest",
    href: "https://www.xprize.org/competitions/rainforest",
  },
];

const SECONDARY = [
  {
    label: "BCG & Handelsblatt Vordenker:innen",
    href: "https://www.gainforest.earth/",
  },
  { label: "SwissTech Award", href: "https://www.gainforest.earth/" },
  { label: "Web3 Foundation Grant", href: "https://web3.foundation/" },
  { label: "Solana Climate Grant", href: "https://solana.org/" },
  { label: "Filecoin Green", href: "https://green.filecoin.io/" },
];

export function AwardsStrip() {
  const t = useT();
  return (
    <section
      aria-label="Awards"
      className="border-t border-border-soft bg-background"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-10 sm:px-10 lg:px-16 lg:py-14">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          {/* Primary line — Winners of … */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-5 sm:gap-y-2">
            <span className="font-instrument italic text-[15px] lg:text-[16px] text-foreground/55">
              {t("awards.label")}
            </span>
            <ul className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              {PRIMARY_AWARDS.map((a) => (
                <li key={a.label}>
                  <a
                    href={a.href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-garamond text-[20px] lg:text-[24px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground transition-colors hover:text-primary"
                  >
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Secondary recognitions — quieter ledger to the right */}
          <div className="flex flex-col gap-2 lg:items-end">
            <span className="font-instrument italic text-[13px] lg:text-[14px] text-foreground/45">
              {t("awards.alsoLabel")}
            </span>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:justify-end">
              {SECONDARY.map((a, i) => (
                <li
                  key={a.label}
                  className="flex items-center gap-x-4"
                >
                  <a
                    href={a.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] lg:text-[13.5px] text-foreground/70 transition-colors hover:text-foreground"
                  >
                    {a.label}
                  </a>
                  {i < SECONDARY.length - 1 && (
                    <span
                      aria-hidden
                      className="hidden h-[2px] w-[2px] rounded-full bg-foreground/25 sm:inline-block"
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
