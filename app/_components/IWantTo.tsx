"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// Four "I want to..." cards plus a tropical sprig decoration on the right.
// Layout port of the bottom section in the reference mockup
// (/Users/david/Downloads/02101890-2e05-463d-8151-44123926d31b.png).
const CARDS: ReadonlyArray<{
  icon: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  href: string;
}> = [
  {
    icon: "/decor/icon-want-discover.png",
    titleKey: "iwantto.card1.title",
    bodyKey: "iwantto.card1.body",
    href: GLOBE_URL,
  },
  {
    icon: "/decor/icon-want-browse.png",
    titleKey: "iwantto.card2.title",
    bodyKey: "iwantto.card2.body",
    href: `${BUMICERTS_URL}/explore`,
  },
  {
    icon: "/decor/icon-want-create.png",
    titleKey: "iwantto.card3.title",
    bodyKey: "iwantto.card3.body",
    href: `${BUMICERTS_URL}/create`,
  },
  {
    icon: "/decor/icon-want-learn.png",
    titleKey: "iwantto.card4.title",
    bodyKey: "iwantto.card4.body",
    href: "https://gainforest.earth",
  },
];

export function IWantTo() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-16 pt-14 pb-12">
        <h2 className="font-garamond text-[44px] font-normal leading-[1.05] text-foreground">
          {t("iwantto.heading")}
        </h2>

        <div className="relative mt-8">
          {/* Reserve ~190px on the right for the tropical sprig so it
              doesn't overlap the 4th card. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:pr-[190px]">
            {CARDS.map((card) => (
              <Link
                key={card.titleKey}
                href={card.href}
                target="_blank"
                rel="noreferrer"
                className="group relative flex h-[280px] flex-col rounded-[16px] border border-border-soft bg-background/40 p-7 transition-colors hover:border-primary/40 hover:bg-background/70"
              >
                <div className="relative h-[68px] w-[68px]">
                  <Image
                    src={card.icon}
                    alt=""
                    fill
                    sizes="68px"
                    className="object-contain object-left"
                  />
                </div>
                <h3 className="mt-7 font-garamond text-[22px] font-medium leading-tight text-foreground">
                  {t(card.titleKey)}
                </h3>
                <p className="mt-3 max-w-[230px] text-[14px] leading-relaxed text-foreground/65">
                  {t(card.bodyKey)}
                </p>
                <span
                  aria-hidden
                  className="mt-auto inline-flex h-7 w-7 items-center justify-center text-primary transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            ))}
          </div>

          {/* Tropical sprig on the right — a distinct, sparser, taller
              specimen (monstera + fern + palm + philodendron) generated
              specifically for this slot via gpt-image so it complements
              the lusher hero plant instead of duplicating it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 -top-14 hidden h-[420px] w-[170px] opacity-90 lg:block"
          >
            <Image
              src="/decor/sprig-side.png"
              alt=""
              fill
              sizes="170px"
              className="object-contain object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
