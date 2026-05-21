"use client";

import Image from "next/image";
import { useLocale } from "../../_components/LocaleProvider";
import { getAboutT } from "../_messages";

// "Backed by friends who believe in this future." — supporter logo
// strip dedicated to the /about page.
//
// Re-uses the supporter logo assets the landing's <Supporters />
// component already ships in /public/decor/supporters/, but renders
// them in a tighter editorial grid suited to the about page (no
// auto-marquee, no scrolling). Same monochrome treatment so the
// wall stays calm on cream.
type Logo = { src: string; alt: string; h: number };

const LOGOS: ReadonlyArray<Logo> = [
  { src: "/decor/supporters/ethereum-foundation.png", alt: "Ethereum Foundation", h: 28 },
  { src: "/decor/supporters/filecoin-foundation.png", alt: "Filecoin Foundation", h: 24 },
  { src: "/decor/supporters/klarna.png", alt: "Klarna AI for Climate Resilience", h: 26 },
  { src: "/decor/supporters/xprize-rainforest.png", alt: "XPRIZE Rainforest", h: 34 },
  { src: "/decor/awards/earthshot.svg", alt: "Earthshot Prize", h: 32 },
  { src: "/decor/awards/world-economic-forum.svg", alt: "World Economic Forum", h: 30 },
  { src: "/decor/awards/solana.svg", alt: "Solana", h: 18 },
  { src: "/decor/awards/bcg.svg", alt: "BCG & Handelsblatt Vordenker:innen", h: 24 },
];

export function AboutRecognition() {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  return (
    <section
      aria-label="Recognition"
      className="border-t border-border-soft bg-background"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-14 sm:px-10 lg:px-16 lg:py-20">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className="lg:col-span-5">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("about.recognition.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[28px] sm:text-[34px] lg:text-[42px] font-normal leading-[1.1] tracking-[-0.005em] text-foreground">
              {t("about.recognition.heading")}
            </h2>
          </div>
          <div className="lg:col-span-7">
            <p className="max-w-[640px] text-[15px] lg:text-[16.5px] leading-[1.6] text-foreground/72">
              {t("about.recognition.body")}
            </p>
            <ul
              role="list"
              className="mt-8 flex flex-wrap items-center gap-x-9 gap-y-6 lg:mt-10"
            >
              {LOGOS.map((l) => (
                <li
                  key={l.src}
                  className="flex shrink-0 items-center"
                  style={{ height: l.h }}
                >
                  <Image
                    src={l.src}
                    alt={l.alt}
                    width={300}
                    height={l.h}
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
    </section>
  );
}
