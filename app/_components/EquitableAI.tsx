"use client";

import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

// "We build equitable technology and AI" — three open-research pillars
// matching gainforest.earth's "Equitable AI" section.
//
//   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
//   │   video      │  │   video      │  │   video      │
//   │   (4:5       │  │   (4:5       │  │   (4:5       │
//   │   portrait,  │  │   portrait,  │  │   portrait,  │
//   │   autoplay   │  │   autoplay   │  │   autoplay   │
//   │   loop)      │  │   loop)      │  │   loop)      │
//   ├──────────────┤  ├──────────────┤  ├──────────────┤
//   │ AI Assistants│  │ Bioacoustics │  │ Remote Sensg │
//   │ 1 line body  │  │ 1 line body  │  │ 1 line body  │
//   └──────────────┘  └──────────────┘  └──────────────┘
//
// Each pillar plays an actual 15-second loop of gainforest.earth's
// documentary footage (re-encoded down from the upstream sources —
// see public/videos/README for the original mapping). Videos are
// muted, autoplay, loop, playsInline so they behave as ambient
// B-roll rather than as media-player widgets. A static poster
// .webp is preloaded so the card never shows a black frame.
//
// Sources (all from gainforest.earth's Equitable AI section):
//  - AI Assistants  ← _assets/video/0704a1c2…mp4 (99s portrait doc,
//                     features Marina Mura & the Taina interface)
//  - Bioacoustics   ← _assets/video/610cc931…mp4 (167s portrait doc,
//                     features the green audio recorder + Oceanus
//                     Conservation mangrove fieldwork)
//  - Remote Sensing ← _assets/video/a21b2c9c…mp4 (30s landscape doc,
//                     aerial canopy with tree-crown segmentation)
const PILLARS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
  video: string;
  poster: string;
  alt: string;
}> = [
  {
    titleKey: "equitableAI.pillar1.title",
    bodyKey: "equitableAI.pillar1.body",
    video: "/videos/pillar-ai-assistants.mp4",
    poster: "/videos/pillar-ai-assistants-poster.webp",
    alt: "Documentary footage of Indigenous scientists using the Taina AI assistant",
  },
  {
    titleKey: "equitableAI.pillar2.title",
    bodyKey: "equitableAI.pillar2.body",
    video: "/videos/pillar-bioacoustics.mp4",
    poster: "/videos/pillar-bioacoustics-poster.webp",
    alt: "Field researcher recording bioacoustic data in mangrove forest",
  },
  {
    titleKey: "equitableAI.pillar3.title",
    bodyKey: "equitableAI.pillar3.body",
    video: "/videos/pillar-remote-sensing.mp4",
    poster: "/videos/pillar-remote-sensing-poster.webp",
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

        <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-x-10">
          {PILLARS.map((p) => (
            <article key={p.titleKey} className="flex flex-col">
              {/* Video frame. Portrait 4:5 (taller-than-wide) to match
                  gainforest.earth's tile orientation; rounded card chrome
                  matches Bumicerts. Video is muted-autoplay-loop so it
                  reads as ambient documentary B-roll. The poster .webp
                  is preloaded so the card never shows a black frame. */}
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[14px] border border-[#e6dfd0] bg-[#1c1c1a]">
                <video
                  src={p.video}
                  poster={p.poster}
                  // Autoplay only works when muted; playsInline is
                  // required so iOS Safari doesn't promote to fullscreen.
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={p.alt}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Subtle bottom shade so the documentary subtitle text
                    baked into the video doesn't fight the headline
                    beneath. */}
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
