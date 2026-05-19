"use client";

import { useT } from "./LocaleProvider";

// "Merci to our supporters." — port of gainforest.earth's closing
// supporter strip.
//
// The original site shows a raster logo wall. We don't ship those (no
// permission for some, and a chunky logo wall clashes with the
// editorial rhythm). Instead we render the supporter names as quiet
// serif chips on cream — same vibe as a closing acknowledgement page
// in a museum catalogue.
//
// We intentionally avoid guessing the full upstream logo wall from
// gainforest.earth (some logos render as image-only assets with no
// accessible names). These category chips preserve the supporter beat
// without inventing a sponsor roster.
const SUPPORTERS = [
  "Public prizes",
  "Climate foundations",
  "Open-source grants",
  "University labs",
  "Research partners",
  "Web3 infrastructure",
  "Community donors",
  "Friends of GainForest",
];

export function Supporters() {
  const t = useT();
  const before = t("supporters.heading.before").trim();
  const italic = t("supporters.heading.italic").trim();
  const after = t("supporters.heading.after").trim();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end lg:gap-16">
          <div className="lg:col-span-7">
            <h2 className="font-garamond text-[32px] sm:text-[40px] lg:text-[48px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span>{after}</span>}
            </h2>
          </div>
          <p className="text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70 lg:col-span-5">
            {t("supporters.body")}
          </p>
        </div>

        {/* Calm typographic chips. Soft border, no fill — they're
            attributions, not buttons. */}
        <ul className="mt-12 flex flex-wrap gap-x-3 gap-y-3 lg:mt-16 lg:gap-x-4 lg:gap-y-4">
          {SUPPORTERS.map((s) => (
            <li
              key={s}
              className="inline-flex h-9 items-center rounded-full border border-foreground/20 px-4 font-garamond text-[14.5px] lg:text-[15px] text-foreground/85"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
