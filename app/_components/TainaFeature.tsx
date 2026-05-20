"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "./LocaleProvider";
import {
  CODEX_PET_CELL_H,
  CODEX_PET_CELL_W,
  renderPetAnimated,
  type CodexPetState,
} from "../_lib/codex-pet";

// "Meet Taina, our community AI." — editorial feature card that gives
// the floating sprite a story.
//
// Layout: two columns on desktop, stacked on mobile.
//   ┌──────────────────────────┐  ┌──────────────────────────┐
//   │  eyebrow                 │  │   ╔══════════════════╗   │
//   │  Serif headline w/       │  │   ║  documentary  ║   │
//   │  italic "Taina"          │  │   ║  (documentary    ║   │
//   │                          │  │   ║   still from     ║   │
//   │  body copy               │  │   ║   gainforest.earth)║ │
//   │  → Say hi to Taina  →    │  │   ║   ┌──────┐       ║   │
//   │                          │  │   ║   │sprite│       ║   │
//   │                          │  │   ╚═══└──────┘═══════╝   │
//   └──────────────────────────┘  └──────────────────────────┘
//
// The right column plays a 15-second ambient documentary loop
// (muted autoplay) pulled directly from gainforest.earth's "Indigenous
// AI Assistant" section. The clip features Indigenous scientists
// from Greater Manaus — including Vanda Witoto (Social Entrepreneur
// and teacher) and other community voices — speaking about Taina.
// The actual Taina codex-pet sprite floats over the bottom-right
// corner of the video so the section reads as "the humans behind
// Taina + Taina herself" in one visual beat.
//
// The sprite reuses the SAME codex-pet sheet that FloatingTaina renders
// (renderPetAnimated from `_lib/codex-pet.ts`) so the page has a
// consistent "Taina presence". Hovering the sprite makes her wave;
// clicking dispatches a `taina:open` custom event so FloatingTaina can
// open her chat panel without this component coupling to it.
//
// Source: gainforest.earth `_assets/video/6e3a1150…mp4` (76s portrait
// doc; we use the first 15s, muted, looped, no audio).
const SPRITE_DISPLAY_SIZE = 160; // px square — smaller because she's
// layered onto the photo now rather than sitting on a blank card.
const PIXEL_SCALE = SPRITE_DISPLAY_SIZE / CODEX_PET_CELL_H; // ~0.77

export function TainaFeature() {
  const t = useT();
  const before = t("tainaFeature.heading.before").trim();
  const italic = t("tainaFeature.heading.italic").trim();
  const after = t("tainaFeature.heading.after").trim();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<CodexPetState>("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return renderPetAnimated(canvas, "/codex-pets/taina-sheet.webp", state);
  }, [state]);

  function openTaina() {
    window.dispatchEvent(new CustomEvent("taina:open"));
  }

  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("tainaFeature.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[40px] lg:text-[52px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span>{after}</span>}
            </h2>
            <p className="mt-6 max-w-[600px] text-[15.5px] lg:text-[17px] leading-[1.55] text-foreground/75">
              {t("tainaFeature.body")}
            </p>

            {/* Attribution line — small, italic, credits the humans.
                Reinforces that Taina is co-designed, not imposed. */}
            <p className="mt-5 max-w-[600px] font-instrument italic text-[14px] text-foreground/55">
              Co-designed with Indigenous scientists from Greater
              Manaus — part of GainForest's Nature Guild collaboration.
            </p>

            <button
              type="button"
              onClick={openTaina}
              className="group mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-primary transition-colors hover:text-primary-dark"
            >
              {t("tainaFeature.cta")}
              <span
                aria-hidden
                className="inline-block transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </button>
          </div>

          <div className="lg:col-span-5">
            {/* Tall portrait card — ambient documentary loop from
                gainforest.earth's "Indigenous AI Assistant" section.
                Muted autoplay-loop so it reads as B-roll rather than a
                media player. The sprite is layered on the bottom-right
                so the section reads as "the humans behind Taina +
                Taina herself" in one visual beat. */}
            <div className="relative mx-auto aspect-[4/5] max-w-[420px] overflow-hidden rounded-[18px] border border-[#e6dfd0] bg-[#1c1c1a]">
              <video
                src="/videos/taina-feature.mp4"
                poster="/videos/taina-feature-poster.webp"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Indigenous scientists from Greater Manaus speaking about Taina"
                className="absolute inset-0 h-full w-full object-cover"
              />

              {/* Top-left attribution chip — tiny, cream, hugging
                  the video's top edge. Positioned at the top so it
                  doesn't fight any documentary subtitle text baked
                  into the lower thirds of the video frames. */}
              <span className="absolute top-3 left-3 font-instrument italic text-[11px] tracking-[0.02em] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                Indigenous scientists · Greater Manaus
              </span>

              {/* Sprite floating in the bottom-right. Hovering makes
                  her wave; clicking opens the chat. */}
              <button
                type="button"
                aria-label={t("tainaFeature.cta")}
                onMouseEnter={() => setState("waving")}
                onMouseLeave={() => setState("idle")}
                onClick={openTaina}
                className="absolute -bottom-1 right-3 cursor-pointer drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)]"
                style={{
                  width: SPRITE_DISPLAY_SIZE,
                  height: SPRITE_DISPLAY_SIZE,
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={Math.round(CODEX_PET_CELL_W * PIXEL_SCALE)}
                  height={Math.round(CODEX_PET_CELL_H * PIXEL_SCALE)}
                  className="block h-full w-full"
                  // Pixel art: do NOT smooth.
                  style={{ imageRendering: "pixelated" }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
