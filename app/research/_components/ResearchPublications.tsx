"use client";

import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT, type ResearchKey } from "../_messages";
import { PUBLICATIONS, pickLocale, type PublicationKind } from "../_data";

// "Selected papers, datasets, and writing." — horizontal carousel
// styled so each card reads as a miniature academic paper preview.
//
// Visual recipe (per card, top to bottom):
//
//   ┌────────────────────────────────────┐
//   │       NeurIPS 2024 · 2024          │  ← small-caps venue header
//   │   ───────────────────────────      │     hairline rule (paper top)
//   │                                    │
//   │      OAM-TCD: A Globally           │
//   │      Diverse Dataset of …          │  ← centred Garamond title
//   │                                    │
//   │   Veitch-Michaelis, Dao, et al.    │  ← italic Instrument-Serif authors
//   │                                    │
//   │   ── ABSTRACT ──                   │  ← small-caps section marker
//   │                                    │     with side rules, like a paper
//   │   280,000+ instance annotations    │
//   │   of individual tree crowns …      │  ← summary body
//   │                                    │
//   │   ─────────────────                │  ← footer rule
//   │   Dataset                  →       │  ← kind label + arrow
//   └────────────────────────────────────┘
//
// The recipe is the same for papers, datasets, workshops, talks, and
// essays — talks are treated as citation-style entries to match the
// editorial register. The kind chip at the footer disambiguates.
//
// Why this layout rather than the news-thumbnail style from
// Media.tsx: papers don't have native cover art, so the design
// system instead borrows the typographic anchors readers already
// associate with academic writing (centred serif title, italic
// author line, small-caps section markers). It also lets the
// /research carousel sit visually adjacent to the landing's awards
// carousel without colliding — different content, different shape.

// Venues that already carry the year (e.g. "NeurIPS 2024") shouldn't
// have it appended again. This keeps the header line clean across the
// mixed dataset where some venues include the year and some don't.
function formatVenue(venue: string, year: string): string {
  return venue.includes(year) ? venue : `${venue} · ${year}`;
}

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
            {PUBLICATIONS.map((raw) => {
              const pub = pickLocale(raw, locale);
              const kindLabel = t(kindKey(pub.kind));
              const venueLine = formatVenue(pub.venue, pub.year);
              return (
                <li
                  key={pub.slug}
                  className="flex w-[300px] shrink-0 snap-start sm:w-[340px] lg:w-[360px]"
                >
                  <Link
                    href={pub.href}
                    target="_blank"
                    rel="noreferrer"
                    /* `bg-background` for the card body keeps it on
                       brand; a marginally stronger drop-shadow than
                       the news carousel uses gives a touch of lift
                       so it reads as a sheet of paper on the cream
                       page. Corners are tighter (rounded-[6px]) than
                       the news cards' 18px so they feel more
                       paper-like. */
                    className="group relative flex min-h-[480px] w-full flex-col rounded-[6px] border border-border-soft bg-background px-6 py-7 shadow-[0_3px_14px_-6px_rgba(40,50,30,0.10)] transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_22px_50px_-26px_rgba(40,50,30,0.30)] sm:px-8 sm:py-9"
                  >
                    {/* Venue header — small caps, mirrors the
                        preprint header line on real arXiv/AAAI PDFs. */}
                    <div className="text-center">
                      <span className="font-instrument italic text-[10.5px] uppercase tracking-[0.24em] text-foreground/50">
                        {venueLine}
                      </span>
                    </div>
                    <div
                      aria-hidden
                      className="mt-3 h-px w-full bg-border-soft"
                    />

                    {/* Title — centred Garamond, the dominant
                        typographic gesture on the card. Slightly
                        smaller than the section h2 so the carousel
                        doesn't out-shout the surrounding page. */}
                    <h3 className="mt-7 text-center font-garamond text-[19px] sm:text-[21px] font-normal leading-[1.22] tracking-[-0.005em] text-foreground">
                      {pub.title}
                    </h3>

                    {/* Authors — italic Instrument Serif, centred. */}
                    <p className="mt-3 text-center font-instrument italic text-[12.5px] leading-[1.3] text-foreground/65">
                      {pub.authors}
                    </p>

                    {/* "Abstract" section marker — small caps with
                        side rules, the way printed papers separate
                        the abstract from the title block. */}
                    <div className="mt-7 flex items-center justify-center gap-3">
                      <span
                        aria-hidden
                        className="h-px w-8 bg-border-soft"
                      />
                      <span className="font-instrument italic text-[10px] uppercase tracking-[0.26em] text-foreground/45">
                        {t("research.publications.abstract")}
                      </span>
                      <span
                        aria-hidden
                        className="h-px w-8 bg-border-soft"
                      />
                    </div>

                    {/* Summary — left-aligned regular body text. The
                        academic-paper feel comes from the structure
                        above; the body itself stays as plain
                        readable sans for legibility. */}
                    <p className="mt-4 text-[13px] leading-[1.6] text-foreground/72">
                      {pub.summary}
                    </p>

                    {/* Footer — kind label on the left, arrow on
                        the right. The thin top border doubles as a
                        page-foot separator. */}
                    <div className="mt-auto flex items-center justify-between gap-4 border-t border-border-soft/70 pt-4">
                      <span className="text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
                        {kindLabel}
                      </span>
                      <span
                        aria-hidden
                        className="text-[18px] text-primary transition-transform group-hover:translate-x-1"
                      >
                        →
                      </span>
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
