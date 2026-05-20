"use client";

import Image from "next/image";
import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

// "We build equitable technology and AI" — three open-research pillars
// matching gainforest.earth's "Equitable AI" section.
//
//   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
//   │   still      │  │   still      │  │   still      │
//   │   (4:5       │  │   (4:5       │  │   (4:5       │
//   │   portrait)  │  │   portrait)  │  │   portrait)  │
//   ├──────────────┤  ├──────────────┤  ├──────────────┤
//   │ AI Assistants│  │ Bioacoustics │  │ Remote Sensg │
//   │ 1 line body  │  │ 1 line body  │  │ 1 line body  │
//   └──────────────┘  └──────────────┘  └──────────────┘
//
// Each pillar's still is a frame extracted directly from the
// documentary videos on gainforest.earth's Equitable AI section
// (AI-Assistants tile poster + Bioacoustics-tile poster + canopy
// tree-crown segmentation video). We use portrait stills with their
// original documentary captions intact — the captions ("Taina is an
// artificial intelligence", "So every animal has its own radio
// channel") reinforce the editorial documentary tone better than any
// stock-looking flat illustration would. Portrait aspect matches the
// 9:16 tile orientation on gainforest.earth.
const PILLARS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
  image: string;
  alt: string;
}> = [
  {
    titleKey: "equitableAI.pillar1.title",
    bodyKey: "equitableAI.pillar1.body",
    image: "/decor/pillar-ai-assistants.webp",
    alt: "Taina is an artificial intelligence",
  },
  {
    titleKey: "equitableAI.pillar2.title",
    bodyKey: "equitableAI.pillar2.body",
    image: "/decor/pillar-bioacoustics.webp",
    alt: "Bioacoustic monitor — every animal has its own radio channel",
  },
  {
    titleKey: "equitableAI.pillar3.title",
    bodyKey: "equitableAI.pillar3.body",
    image: "/decor/pillar-remote-sensing.webp",
    alt: "Tree-crown segmentation from aerial imagery",
  },
];

export function EquitableAI() {
  const t = useT();
  const before = t("equitableAI.heading.before").trim();
  const italic = t("equitableAI.heading.italic").trim();
  const after = t("equitableAI.heading.after").trim();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-20 pb-20 sm:px-10 lg:px-16 lg:pt-24 lg:pb-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("equitableAI.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[40px] lg:text-[52px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span> {after}</span>}
            </h2>
          </div>
          <p className="text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70 lg:col-span-5">
            {t("equitableAI.subheading")}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-x-10">
          {PILLARS.map((p) => (
            <article key={p.titleKey} className="flex flex-col">
              {/* Image frame. Portrait 4:5 (taller-than-wide) to match
                  gainforest.earth's tile orientation; rounded card chrome
                  matches Bumicerts. */}
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[14px] border border-[#e6dfd0] bg-[#1c1c1a]">
                <Image
                  src={p.image}
                  alt={p.alt}
                  fill
                  sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
                {/* Subtle bottom shade so the documentary subtitle text
                    in the still doesn't fight the headline beneath. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-b from-transparent to-black/15"
                />
              </div>
              <h3 className="mt-6 font-garamond text-[26px] lg:text-[30px] font-normal leading-[1.1] tracking-[-0.005em] text-foreground">
                {t(p.titleKey)}
              </h3>
              <p className="mt-3 max-w-[380px] text-[14.5px] leading-[1.55] text-foreground/70">
                {t(p.bodyKey)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
