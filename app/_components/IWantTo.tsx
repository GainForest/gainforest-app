"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// "I want to…" — four-card decision strip.
//
// Editorial rewrite: drop the hand-drawn `icon-want-*.png` set and the
// tropical `sprig-side.png` (the team called both out as thin-stroke
// art that doesn't match the rendered apps). What's left is pure
// typography — a numbered ledger of routes the visitor can take.
// Mirrors the editorial restraint of gainforest.earth's section blocks.
const CARDS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
  href: string;
}> = [
  {
    titleKey: "iwantto.card1.title",
    bodyKey: "iwantto.card1.body",
    href: GLOBE_URL,
  },
  {
    titleKey: "iwantto.card2.title",
    bodyKey: "iwantto.card2.body",
    href: `${BUMICERTS_URL}/explore`,
  },
  {
    titleKey: "iwantto.card3.title",
    bodyKey: "iwantto.card3.body",
    href: `${BUMICERTS_URL}/create`,
  },
  {
    titleKey: "iwantto.card4.title",
    bodyKey: "iwantto.card4.body",
    href: "https://gainforest.earth",
  },
];

export function IWantTo() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-20 pb-20 sm:px-10 lg:px-16 lg:pt-24 lg:pb-24">
        <h2 className="font-garamond text-[32px] sm:text-[40px] lg:text-[44px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground">
          {t("iwantto.heading")}
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card, i) => (
            <Link
              key={card.titleKey}
              href={card.href}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col border-t border-foreground/20 pt-5 transition-colors hover:border-foreground/80"
            >
              <span className="font-instrument italic text-[14px] text-foreground/45">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 font-garamond text-[24px] lg:text-[26px] font-normal leading-[1.15] text-foreground">
                {t(card.titleKey)}
              </h3>
              <p className="mt-3 text-[14.5px] leading-[1.55] text-foreground/65">
                {t(card.bodyKey)}
              </p>
              <span
                aria-hidden
                className="mt-6 inline-flex items-center text-[18px] text-foreground/40 transition-all group-hover:translate-x-1 group-hover:text-foreground"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
