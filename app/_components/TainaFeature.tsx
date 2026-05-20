"use client";

import { useT } from "./LocaleProvider";
import { HoverVideo } from "./HoverVideo";

// "Meet Taina, our community AI." — editorial feature section.
//
// Layout: two columns on desktop, stacked on mobile.
//   ┌──────────────────────────┐  ┌──────────────────────────┐
//   │  eyebrow                 │  │   ┌──────────────────┐   │
//   │  Serif headline w/       │  │   │   video          │   │
//   │  italic "Taina"          │  │   │   (4:5, hover    │   │
//   │                          │  │   │    to play)      │   │
//   │  body copy               │  │   │           0:15   │   │
//   │  attribution (italic)    │  │   └──────────────────┘   │
//   │  → Say hi to Taina  →    │  │   museum caption (italic)│
//   └──────────────────────────┘  └──────────────────────────┘
//
// The right column plays a 15-second ambient documentary loop on
// hover — pulled directly from gainforest.earth's "Indigenous AI
// Assistant" section. The clip features Indigenous scientists from
// Greater Manaus (including Vanda Witoto, Social Entrepreneur and
// teacher) speaking about Taina.
//
// We previously layered the Taina codex-pet sprite over the
// bottom-right of the video. The team asked us to drop it — the
// FloatingTaina widget already provides the sprite presence
// anywhere on the page, so doubling up inside this card just made
// the section feel busy. The cleaner layout treats this section as
// a museum-style portrait: video on the right, an italic caption
// beneath, text + CTA on the left. The CTA still dispatches
// `taina:open` so clicking it pops the floating chat panel.
//
// Source: gainforest.earth `_assets/video/6e3a1150…mp4` (76 s
// portrait doc; we use the first 15 s, muted, looped, no audio).
export function TainaFeature() {
  const t = useT();
  const before = t("tainaFeature.heading.before").trim();
  const italic = t("tainaFeature.heading.italic").trim();
  const after = t("tainaFeature.heading.after").trim();

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

            {/* Attribution line — small, italic, quietly credits
                the human collaborators behind Taina. */}
            <p className="mt-5 max-w-[600px] font-instrument italic text-[14px] text-foreground/55">
              Co-designed with Indigenous scientists from Greater
              Manaus; part of GainForest&apos;s Nature Guild
              collaboration.
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
            <div className="mx-auto max-w-[420px]">
              <HoverVideo
                src="/videos/taina-feature.mp4"
                poster="/videos/taina-feature-poster.webp"
                ariaLabel="Indigenous scientists from Greater Manaus speaking about Taina"
                durationLabel="0:46"
                aspectClass="aspect-[4/5]"
                className="rounded-[18px]"
              />
              {/* Museum-style italic caption — credits the humans on
                  screen without overlaying the video itself. */}
              <span className="mt-4 block text-center font-instrument italic text-[12.5px] tracking-[0.02em] text-foreground/55">
                Indigenous scientists · Greater Manaus
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
