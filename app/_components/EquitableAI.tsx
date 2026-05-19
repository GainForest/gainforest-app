"use client";

import Image from "next/image";
import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

// "We build equitable technology and AI" — three open-research pillars
// matching gainforest.earth's "Equitable AI" section.
//
//   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
//   │   image (4:3)     │  │   image (4:3)     │  │   image (4:3)     │
//   │                   │  │                   │  │                   │
//   ├───────────────────┤  ├───────────────────┤  ├───────────────────┤
//   │ AI Assistants     │  │ Bioacoustics      │  │ Remote Sensing    │
//   │ 1 line body       │  │ 1 line body       │  │ 1 line body       │
//   └───────────────────┘  └───────────────────┘  └───────────────────┘
//
// Each pillar gets a raster image — generated via gpt-image-2 per
// AGENTS.md's "decoration via gpt-image-2 only" rule. The images are
// documentary-style stills (not flat icons) so the visual weight
// matches the live Globe + Bumicerts windows in the hero.
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
    alt: "AI Assistants",
  },
  {
    titleKey: "equitableAI.pillar2.title",
    bodyKey: "equitableAI.pillar2.body",
    image: "/decor/pillar-bioacoustics.webp",
    alt: "Bioacoustics",
  },
  {
    titleKey: "equitableAI.pillar3.title",
    bodyKey: "equitableAI.pillar3.body",
    image: "/decor/pillar-remote-sensing.webp",
    alt: "Remote Sensing",
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
              {/* Image frame. Cream card behind the image with rounded
                  corners, matching the chunky card chrome on the Bumicerts
                  hero card so the two surfaces feel related. */}
              <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[14px] border border-[#e6dfd0] bg-[#fbf8f0]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <Image
                  src={p.image}
                  alt={p.alt}
                  fill
                  sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
                {/* Hairline gradient at the bottom so the foliage doesn't
                    fight the headline beneath it. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#fbf8f0]/40"
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
