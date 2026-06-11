"use client";

import Image from "next/image";
import { useT } from "./LocaleProvider";
import { SUPPORTER_LOGOS, supporterHeightFor } from "../_lib/supporters";

// "Merci to our supporters." — port of gainforest.earth's closing
// supporter strip.
//
// Editorial monochrome wall (17 logos extracted from gainforest.earth):
//
//   Klarna · Milkywire · MA·EARTH · XPRIZE Rainforest+alana · Octant ·
//   Ethereum Foundation · Hypercerts · Fondation Valery ·
//   Filecoin Foundation · CELO · Gitcoin · Devonian · Climate Collective ·
//   Edge City · Glo Dollar · planet. · BKCF
//
// Visual treatment: each logo is rendered in monochrome at a uniform
// height, with subtle opacity, in a single flex-wrap. White
// backgrounds were stripped from the source PNGs so logos blend with
// cream; the `grayscale + brightness(0)` filter chain then collapses
// the remaining art into a single dark silhouette. The result is the
// "editorial logo wall" recipe Stripe / Vercel use — quietly
// authoritative, never shouty.
//
// Why monochrome vs. full-colour (gainforest.earth's choice): the
// upstream Canva-rendered site dedicates a full screen to the wall
// with generous breathing room around every mark. We don't have that
// kind of space mid-scroll, so a flat silhouette treatment lets the
// section read as one block instead of 17 competing brand colours.

// Logo list + per-logo height tweaks live in `app/_lib/supporters.ts`
// so the About page's recognition wall renders the same canonical set.
// Add a logo there once — it surfaces on both surfaces.
const LOGOS = SUPPORTER_LOGOS;
const heightFor = supporterHeightFor;

export function Supporters() {
  const t = useT();
  const before = t("supporters.heading.before").trim();
  const italic = t("supporters.heading.italic").trim();
  const after = t("supporters.heading.after").trim();
  return (
    <section id="supporters" className="scroll-mt-20 border-t border-border-soft lg:scroll-mt-24">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        {/* Heading + body on a tighter grid so the section reads as a
            quiet footer-style acknowledgement rather than a hero. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <h2 className="font-garamond text-[28px] sm:text-[34px] lg:text-[38px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span>{after}</span>}
            </h2>
          </div>
          <p className="text-[14.5px] lg:text-[15.5px] leading-[1.55] text-foreground/65 lg:col-span-5">
            {t("supporters.body")}
          </p>
        </div>

        {/* Monochrome editorial logo wall.
            - `.logo-mono` (globals.css) desaturates each mark and
              multiplies it onto the light page; on the dark theme it
              flips to invert + screen so the silhouettes stay legible
              on ink.
            - `opacity: 0.62` quiets the wall to a section accent;
              hover restores full presence for an unobtrusive moment
              of identity recognition. */}
        <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 lg:mt-16 lg:gap-x-14 lg:gap-y-10">
          {LOGOS.map((l) => {
            const renderH = heightFor(l.src);
            return (
              <li
                key={l.src}
                className="flex items-center justify-center"
                style={{ height: renderH }}
              >
                <Image
                  src={l.src}
                  alt={l.alt}
                  width={l.w}
                  height={l.h}
                  className="logo-mono opacity-[0.62] transition-opacity duration-200 ease-out hover:opacity-100"
                  style={{
                    height: renderH,
                    width: "auto",
                  }}
                  draggable={false}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
