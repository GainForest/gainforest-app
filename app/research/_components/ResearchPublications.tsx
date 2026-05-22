"use client";

import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT, type ResearchKey } from "../_messages";
import { PUBLICATIONS, pickLocale, type PublicationKind } from "../_data";

// "Papers, essays, and talks; all freely available." — horizontal
// editorial carousel for the /research page.
//
// Visually mirrors the landing's <Media />: scrollable row of fixed-
// width cards, scroll-mandatory snapping, hairline borders, italic
// metadata, single arrow affordance. The two structural differences:
//
//   1. NO COVER IMAGES. Research papers don't have native cover art,
//      and fabricating illustrations would break AGENTS.md hard-rule
//      #1 ("no fake data on the rendered UI"). Cards instead lead
//      with a big Garamond year + venue chip, which reads as a more
//      editorial / library-catalog gesture than a fake thumbnail.
//
//   2. AUTHORS LINE. The publications shape carries an `authors`
//      string that the carousel surfaces under the title; matches
//      how an academic ref list reads.
//
// Localisation: kind chip and summary translate per locale (via
// _messages + _data Translated<>); title, authors, venue stay in
// their source-language so external links land on the right canonical
// surface and so authors aren't mistransliterated.

function kindKey(kind: PublicationKind): ResearchKey {
  return `research.kind.${kind}` as ResearchKey;
}

export function ResearchPublications() {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  return (
    <section
      id="publications"
      className="scroll-mt-20 border-t border-border-soft bg-background lg:scroll-mt-24"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <div>
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("research.publications.eyebrow")}
            </span>
            <h2 className="mt-3 font-garamond text-[32px] sm:text-[40px] lg:text-[48px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {t("research.publications.heading")}
            </h2>
          </div>
          <span className="hidden text-[12px] uppercase tracking-[0.14em] text-foreground/40 sm:inline-flex">
            {t("research.publications.scroll")}
          </span>
        </div>

        <div className="relative mt-12">
          <ul
            className="media-card-carousel -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-6 pt-4 pb-10 sm:-mx-10 sm:px-10 lg:-mx-16 lg:gap-5 lg:px-16"
            role="list"
            aria-label={t("research.publications.heading")}
          >
            {PUBLICATIONS.map((raw, i) => {
              const pub = pickLocale(raw, locale);
              const kindLabel = t(kindKey(pub.kind));
              return (
                <li
                  key={pub.slug}
                  className="flex w-[286px] shrink-0 snap-start sm:w-[330px] lg:w-[360px]"
                >
                  <Link
                    href={pub.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex min-h-[300px] w-full flex-col overflow-hidden rounded-[18px] border border-border-soft bg-background transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-26px_rgba(40,50,30,0.24)]"
                  >
                    {/* Library-catalog plate replaces the news
                        thumbnail. Sage-tinted band, big Garamond
                        year on the left, italic venue label on the
                        right. Keeps the editorial language and
                        avoids fabricating cover art. */}
                    <div className="relative flex aspect-[16/9] w-full items-end justify-between bg-[#dde3d7] px-5 pb-4 pt-4">
                      <span className="font-garamond text-[64px] font-normal leading-none tracking-tight text-foreground/85">
                        {pub.year}
                      </span>
                      <span className="max-w-[55%] truncate text-right font-instrument italic text-[14px] leading-[1.2] text-foreground/65">
                        {pub.venue}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
                        {String(i + 1).padStart(2, "0")} · {kindLabel}
                      </span>

                      <h3 className="mt-3 font-garamond text-[20px] font-normal leading-[1.15] text-foreground sm:text-[22px]">
                        {pub.title}
                      </h3>

                      <p className="mt-2 truncate text-[12px] uppercase tracking-[0.12em] text-foreground/45">
                        {pub.authors}
                      </p>

                      <p className="mt-3 text-[13.5px] leading-[1.55] text-foreground/65">
                        {pub.summary}
                      </p>

                      <div className="mt-auto flex items-center justify-between gap-4 border-t border-border-soft pt-4">
                        <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.14em] text-foreground/45">
                          {pub.venue}
                        </span>
                        <span
                          aria-hidden
                          className="inline-flex items-center text-[18px] text-primary transition-transform group-hover:translate-x-1"
                        >
                          →
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
