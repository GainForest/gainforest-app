"use client";

import { useT } from "./LocaleProvider";
import { HoverVideo } from "./HoverVideo";
import type { MessageKey } from "../_lib/i18n";

// "We build local-first technology and AI" — three open-research
// pillars matching gainforest.earth's "Equitable AI" section. (The
// gainforest.earth section is still labelled "Equitable AI"; we
// renamed the landing's copy to "Local-first AI" to land the framing
// closer to where the work actually sits — community-owned data,
// community-hosted models, community-governed decisions.)
//
//   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
//   │   video      │  │   video      │  │   video      │
//   │   (4:5,      │  │   (4:5,      │  │   (4:5,      │
//   │   hover to   │  │   hover to   │  │   hover to   │
//   │   play)      │  │   play)      │  │   play)      │
//   │       0:15   │  │       0:15   │  │       0:15   │
//   ├──────────────┤  ├──────────────┤  ├──────────────┤
//   │ caption      │  │ caption      │  │ caption      │  (italic)
//   │ AI Assistants│  │ Bioacoustics │  │ Remote Sensg │
//   │ 1 line body  │  │ 1 line body  │  │ 1 line body  │
//   └──────────────┘  └──────────────┘  └──────────────┘
//
// Each pillar plays a 15-second loop of gainforest.earth's
// documentary footage on hover only (no autoplay) — see HoverVideo
// for the interaction. A static .webp poster is preloaded so the
// card never shows a black frame, and a tiny italic duration label
// in the bottom-right corner invites interaction without resorting
// to a heavy play-button circle.
//
// Beneath each video sits a small italic caption (museum-style)
// crediting the documentary segment, then the heading + body.
//
// Sources (gainforest.earth's Equitable AI section on the source site):
//  - AI Assistants  ← _assets/video/0704a1c2…mp4 (Marina Mura + Taina)
//  - Bioacoustics   ← _assets/video/610cc931…mp4 (mangrove recorder)
//  - Remote Sensing ← _assets/video/a21b2c9c…mp4 (canopy segmentation)
const PILLARS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
  video: string;
  poster: string;
  caption: string;
  alt: string;
}> = [
  {
    titleKey: "equitableAI.pillar1.title",
    bodyKey: "equitableAI.pillar1.body",
    video: "/videos/pillar-ai-assistants.mp4",
    poster: "/videos/pillar-ai-assistants-poster.webp",
    caption: "Marina Mura · Taina field interview",
    alt: "Documentary footage of Indigenous scientists using the Taina AI assistant",
  },
  {
    titleKey: "equitableAI.pillar2.title",
    bodyKey: "equitableAI.pillar2.body",
    video: "/videos/pillar-bioacoustics.mp4",
    poster: "/videos/pillar-bioacoustics-poster.webp",
    caption: "Oceanus Conservation · mangrove fieldwork",
    alt: "Field researcher recording bioacoustic data in mangrove forest",
  },
  {
    titleKey: "equitableAI.pillar3.title",
    bodyKey: "equitableAI.pillar3.body",
    video: "/videos/pillar-remote-sensing.mp4",
    poster: "/videos/pillar-remote-sensing-poster.webp",
    caption: "Aerial canopy · tree-crown segmentation",
    alt: "Aerial canopy footage with tree-crown segmentation polygons",
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

        <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-x-10">
          {PILLARS.map((p) => (
            <article key={p.titleKey} className="flex flex-col">
              <HoverVideo
                src={p.video}
                poster={p.poster}
                ariaLabel={p.alt}
                aspectClass="aspect-[4/5]"
                className="rounded-[14px]"
              />
              {/* Museum-style italic caption beneath the card. */}
              <span className="mt-4 font-instrument italic text-[12.5px] tracking-[0.02em] text-foreground/50">
                {p.caption}
              </span>
              <h3 className="mt-1.5 font-garamond text-[26px] lg:text-[30px] font-normal leading-[1.1] tracking-[-0.005em] text-foreground">
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
