"use client";

import Link from "next/link";
import type { MessageKey } from "../_lib/i18n";
import { BUMICERTS_URL, GAINFOREST_URL, GLOBE_URL } from "../_lib/urls";
import { useT } from "./LocaleProvider";

// "I want to…" — two-audience routing strip.
//
// Earlier iterations were a flat four-card ledger (Discover / Browse /
// Create / Learn) that only made sense from the donor's perspective.
// This pass splits the strip into two columns — "For communities" on
// the left, "For supporters" on the right — so the page makes both
// audiences feel routed. Communities lead with telling their impact
// story + issuing a Bumicert; supporters land on discovery + backing
// what's already verified.
//
// Visual pattern stays editorial: numbered ledger entries with a thin
// top rule, no icons, no decoration. Mirrors gainforest.earth's section
// blocks.
type Card = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  href: string;
};

const COMMUNITY_CARDS: ReadonlyArray<Card> = [
  {
    titleKey: "iwantto.card1.title",
    bodyKey: "iwantto.card1.body",
    href: GAINFOREST_URL,
  },
  {
    titleKey: "iwantto.card2.title",
    bodyKey: "iwantto.card2.body",
    href: `${BUMICERTS_URL}/bumicert/create`,
  },
];

const SUPPORTER_CARDS: ReadonlyArray<Card> = [
  {
    titleKey: "iwantto.card3.title",
    bodyKey: "iwantto.card3.body",
    href: GLOBE_URL,
  },
  {
    titleKey: "iwantto.card4.title",
    bodyKey: "iwantto.card4.body",
    href: `${BUMICERTS_URL}/explore`,
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

        {/* Two audience columns. On mobile they stack; on lg they sit
            side-by-side. Inside each column the routes stack — two
            ledger entries per audience. */}
        <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-14 lg:grid-cols-2">
          <AudienceGroup
            labelKey="iwantto.community.label"
            cards={COMMUNITY_CARDS}
          />
          <AudienceGroup
            labelKey="iwantto.supporter.label"
            cards={SUPPORTER_CARDS}
          />
        </div>
      </div>
    </section>
  );
}

function AudienceGroup({
  labelKey,
  cards,
}: {
  labelKey: MessageKey;
  cards: ReadonlyArray<Card>;
}) {
  const t = useT();
  return (
    <div>
      <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/50">
        {t(labelKey)}
      </span>
      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
        {cards.map((card, i) => (
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
            <h3 className="mt-4 font-garamond text-[22px] lg:text-[24px] font-normal leading-[1.15] text-foreground">
              {t(card.titleKey)}
            </h3>
            <p className="mt-3 text-[14px] leading-[1.55] text-foreground/65">
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
  );
}
