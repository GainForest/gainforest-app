"use client";

import { Fragment } from "react";
import Image from "next/image";
import { useLocale } from "../../_components/LocaleProvider";
import { getAboutT } from "../_messages";

// "We are tech support for nature." — editorial hero for the /about
// page. Mirrors the landing hero's typography rhythm (Cormorant
// Garamond display + Instrument Serif italic emphasis on a single
// word) so the two surfaces feel like one site, but drops the brush
// stroke — that's reserved for the home page's headline word.
//
// Right column anchors a single documentary photograph (the maloca
// gathering from the Impact Report collage) so the page opens on the
// people, not on a stat or a screenshot.
export function AboutHero() {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  const before = t("about.hero.heading.before").trim();
  const italic = t("about.hero.heading.italic").trim();
  const after = t("about.hero.heading.after").trim();

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-6 px-6 pt-12 pb-14 sm:px-10 lg:gap-12 lg:px-16 lg:pt-20 lg:pb-24">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-7">
          <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
            {t("about.eyebrow")}
          </span>
          <h1 className="mt-5 font-garamond text-[44px] sm:text-[64px] lg:text-[84px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground">
            {before && (
              <Fragment>
                <span>{before}</span>{" "}
              </Fragment>
            )}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && (after === "." ? after : <span> {after}</span>)}
          </h1>
          <p className="mt-6 max-w-[560px] text-[16px] lg:text-[18.5px] leading-[1.55] text-foreground/80">
            {t("about.hero.lede")}
          </p>
        </div>

        {/* RIGHT: documentary photo. Mirrors the editorial weight of
            the landing hero's live cards but stays still — this page
            is about the people, not the live data. Uses the same
            warm field photo the ImpactReport section already ships
            so we don't pull in a new asset just for this hero. */}
        <div className="col-span-12 lg:col-span-5">
          <figure className="m-0">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[10px] shadow-[0_24px_60px_-28px_rgba(40,50,30,0.38)] ring-1 ring-border-soft">
              <Image
                src="/community/impact-group.webp"
                alt="GainForest team and Indigenous community at the maloca, XPRIZE Rainforest finals in Manaus"
                fill
                sizes="(min-width: 1024px) 480px, (min-width: 640px) 70vw, 100vw"
                priority
                className="object-cover"
              />
            </div>
            <figcaption className="mt-3 font-instrument italic text-[13px] text-foreground/55">
              Inhaã-bé · Greater Manaus, Brazil
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
