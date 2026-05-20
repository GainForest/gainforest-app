"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

// "Selected media." — port of gainforest.earth's Awards & Press strip.
//
// Each item is a tiny editorial card with a kind label (Awards / Press /
// Media), a date, and a headline. No raster cover images — keeping the
// strip light and readable, in the spirit of the editorial rhythm the
// team locked down for the page.
//
// Headlines are kept short and in English (these are real titles from
// gainforest.earth's Awards & Press strip — translating them would be
// wrong). Only the surrounding section heading is localised.
type MediaItem = {
  kind: "Awards" | "Press" | "Media";
  date: string;
  headline: string;
  href: string;
};

// Each `href` points to the actual canonical article. The earlier
// 03 / 04 / 02 placeholders that bounced to the gainforest.earth
// homepage were dead ends — a click read as broken even though the
// homepage loaded. Real sources used:
//   - XPRIZE Rainforest competition page (winner announcement)
//   - Handelsblatt Vordenker:innen feature
//   - Ministerio del Ambiente (Paraguay) press release
//   - Swissnex Brazil report "Switzerland and Amazonia" (covers the
//     ETH BiodivX/GainForest collaboration)
const ITEMS: ReadonlyArray<MediaItem> = [
  {
    kind: "Awards",
    date: "Nov 15, 2024",
    headline: "GainForest is an XPRIZE Rainforest Grand Prize Winner",
    href: "https://www.xprize.org/competitions/rainforest",
  },
  {
    kind: "Awards",
    date: "Nov 03, 2022",
    headline: "BCG & Handelsblatt Vordenker:innen 2022",
    href: "https://www.handelsblatt.com/unternehmen/management/vordenker_innen/vordenker-ernaehrung-und-landwirtschaft-besser-essen-fuer-das-weltklima/28848280.html",
  },
  {
    kind: "Press",
    date: "Apr 12, 2022",
    headline: "Paraguay (MADES) announces partnership with GainForest",
    href: "https://www.mades.gov.py/2022/04/12/mades-recibe-apoyo-para-fortalecimiento-de-areas-protegidas-en-el-chaco/",
  },
  {
    kind: "Media",
    date: "Sep 1, 2024",
    headline: "GainForest and ETH BiodivX in Amazonia — Swissnex Brazil",
    href: "https://swissnex.org/brazil/news/switzerland-and-amazonia-together-for-a-thriving-planet/",
  },
];

export function Media() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10">
          <div>
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("media.eyebrow")}
            </span>
            <h2 className="mt-3 font-garamond text-[32px] sm:text-[40px] lg:text-[48px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {t("media.heading")}
            </h2>
          </div>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-10">
          {ITEMS.map((m, i) => (
            <li key={m.headline}>
              <Link
                href={m.href}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col border-t border-foreground/20 pt-5 transition-colors hover:border-foreground/80"
              >
                <span className="font-instrument italic text-[12px] text-foreground/45">
                  {String(i + 1).padStart(2, "0")} · {m.kind} · {m.date}
                </span>
                <h3 className="mt-4 font-garamond text-[20px] lg:text-[22px] font-normal leading-[1.2] text-foreground">
                  {m.headline}
                </h3>
                <span
                  aria-hidden
                  className="mt-5 inline-flex items-center text-[16px] text-foreground/40 transition-all group-hover:translate-x-1 group-hover:text-foreground"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
