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
//   │  eyebrow                 │  │   ┌──────────────────┐   │
//   │  Serif headline w/       │  │   │   Taina sprite   │   │
//   │  italic "Taina"          │  │   │   (animated)     │   │
//   │                          │  │   └──────────────────┘   │
//   │  body copy               │  │   sub-caption            │
//   │  → Say hi to Taina  →    │  │                          │
//   └──────────────────────────┘  └──────────────────────────┘
//
// The right column reuses the SAME codex-pet sprite system that
// FloatingTaina renders (renderPetAnimated from `_lib/codex-pet.ts`)
// — same sheet, same idle/waving state machine — so the page has a
// consistent "Taina presence". Hovering the sprite makes her wave.
//
// On click we dispatch a `taina:open` custom event. FloatingTaina
// listens for it and opens the chat panel without this component
// importing or coupling to the widget's local state.
const SPRITE_DISPLAY_SIZE = 220; // px square preview canvas
const PIXEL_SCALE = SPRITE_DISPLAY_SIZE / CODEX_PET_CELL_H; // ~1.06

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
            <div className="relative mx-auto flex aspect-square max-w-[420px] items-end justify-center overflow-hidden rounded-[18px] border border-[#e6dfd0] bg-[#fbf8f0]">
              {/* The sprite. Hovering makes her wave; clicking dispatches
                  the `taina:open` event (no-op today, hookable later). */}
              <button
                type="button"
                aria-label={t("tainaFeature.cta")}
                onMouseEnter={() => setState("waving")}
                onMouseLeave={() => setState("idle")}
                onClick={openTaina}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 cursor-pointer"
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

              {/* Sub-caption — kept quiet, just the name. */}
              <span className="absolute left-1/2 top-5 -translate-x-1/2 font-instrument italic text-[13px] text-foreground/45">
                Taina · GainForest AI Assistant
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
