"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

// "Awards & press." — horizontal editorial carousel.
//
// Each item is a real external source: awards, press releases,
// documentaries, and launch videos. We keep the cards text-only (no
// thumbnails) so the section stays in the same restrained editorial
// system as the rest of the page: cream cards, Garamond headlines,
// tracking-wide metadata, one arrow affordance.
//
// Research notes for the three additions requested in May 2026:
// - CNA Insider YouTube `SsWzsL03d5M` (yt-dlp metadata):
//   title "This AI App Pays Locals To Conserve Mangroves In The
//   Philippines | Tech To Save The World", channel CNA Insider,
//   uploaded 2025-03-08. Description: documentary episode on how
//   technology/data collection helps conserve mangroves in the
//   Philippines and involves/pay locals for their efforts.
// - Funding the Commons YouTube `kdwHnRJUtTg` (yt-dlp metadata):
//   title "A Community Treasury, Allocated by AI Digital Twins: The
//   Simocracy Experiment", uploaded 2026-05-14. Description names
//   David Dao (Protocol Labs R&D & GainForest), Hypercerts, Funding
//   the Commons, and the Frontier Tower experiment.
// - Klarna investor release (BusinessWire/Klarna page): "Klarna
//   Launches Global AI for Climate Resilience Program..." and lists
//   GainForest e.V. (Latin America) among selected innovators using
//   AI to help Indigenous forest guardians map and monitor
//   biodiversity. BusinessWire newsitem id begins `20251204`, so the
//   carousel date is Dec 4, 2025.
//
// Proper nouns and article titles are not localised; only the section
// heading comes from i18n.
type MediaItem = {
  kind: "Award" | "Press" | "Documentary" | "Launch" | "Grant";
  date: string;
  source: string;
  headline: string;
  summary: string;
  href: string;
};

const ITEMS: ReadonlyArray<MediaItem> = [
  {
    kind: "Launch",
    date: "May 14, 2026",
    source: "Funding the Commons",
    headline: "Simocracy launches with AI digital twins allocating a community treasury",
    summary:
      "A mini-documentary follows the Frontier Tower experiment with David Dao, Hypercerts, Funding the Commons, and community sims deliberating over shared funding.",
    href: "https://www.youtube.com/watch?v=kdwHnRJUtTg",
  },
  {
    kind: "Grant",
    date: "Dec 4, 2025",
    source: "Klarna",
    headline: "GainForest selected for Klarna's AI for Climate Resilience Program",
    summary:
      "Klarna names GainForest e.V. among six selected innovators using AI to support communities on the climate frontlines.",
    href: "https://investors.klarna.com/News--Events/news/news-details/2025/Klarna-Launches-Global-AI-for-Climate-Resilience-Program-to-Empower-Communities-on-the-Climate-Frontlines/default.aspx",
  },
  {
    kind: "Documentary",
    date: "Mar 8, 2025",
    source: "CNA Insider",
    headline: "CNA documents how GainForest helps locals conserve mangroves in the Philippines",
    summary:
      "Tech To Save The World visits the Philippines to show how data collection and AI-backed tools can support mangrove conservation with local communities.",
    href: "https://www.youtube.com/watch?v=SsWzsL03d5M",
  },
  {
    kind: "Award",
    date: "Nov 15, 2024",
    source: "XPRIZE",
    headline: "GainForest is an XPRIZE Rainforest Grand Prize Winner",
    summary:
      "GainForest and partners are recognised through the XPRIZE Rainforest competition for technology that can reveal and protect biodiversity.",
    href: "https://www.xprize.org/competitions/rainforest",
  },
  {
    kind: "Press",
    date: "Sep 1, 2024",
    source: "Swissnex Brazil",
    headline: "GainForest and ETH BiodivX in Amazonia",
    summary:
      "Swissnex reports on Switzerland–Amazonia collaboration, including the ETH BiodivX and GainForest work around biodiversity data and AI.",
    href: "https://swissnex.org/brazil/news/switzerland-and-amazonia-together-for-a-thriving-planet/",
  },
  {
    kind: "Award",
    date: "Nov 3, 2022",
    source: "BCG & Handelsblatt",
    headline: "BCG & Handelsblatt Vordenker:innen 2022",
    summary:
      "GainForest is featured among forward-thinking initiatives connecting food systems, climate, and nature-positive innovation.",
    href: "https://www.handelsblatt.com/unternehmen/management/vordenker_innen/vordenker-ernaehrung-und-landwirtschaft-besser-essen-fuer-das-weltklima/28848280.html",
  },
  {
    kind: "Press",
    date: "Apr 12, 2022",
    source: "MADES Paraguay",
    headline: "Paraguay announces partnership with GainForest",
    summary:
      "The Ministerio del Ambiente y Desarrollo Sostenible announces support to strengthen protected areas in the Chaco.",
    href: "https://www.mades.gov.py/2022/04/12/mades-recibe-apoyo-para-fortalecimiento-de-areas-protegidas-en-el-chaco/",
  },
];

export function Media() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <div>
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("media.eyebrow")}
            </span>
            <h2 className="mt-3 font-garamond text-[32px] sm:text-[40px] lg:text-[48px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {t("media.heading")}
            </h2>
          </div>
          <span className="hidden text-[12px] uppercase tracking-[0.14em] text-foreground/40 sm:inline-flex">
            Scroll →
          </span>
        </div>

        <div className="relative mt-12">
          <ul
            className="media-card-carousel -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-6 pb-3 sm:-mx-10 sm:px-10 lg:-mx-16 lg:gap-5 lg:px-16"
            role="list"
            aria-label={t("media.heading")}
          >
            {ITEMS.map((m, i) => (
              <li
                key={m.href}
                className="flex w-[286px] shrink-0 snap-start sm:w-[330px] lg:w-[360px]"
              >
                <Link
                  href={m.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-h-[280px] w-full flex-col rounded-[18px] border border-border-soft bg-background p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-26px_rgba(40,50,30,0.24)] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
                      {String(i + 1).padStart(2, "0")} · {m.kind}
                    </span>
                    <span className="shrink-0 rounded-full border border-border-soft px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-foreground/45">
                      {m.date}
                    </span>
                  </div>

                  <h3 className="mt-6 font-garamond text-[23px] font-normal leading-[1.08] text-foreground sm:text-[25px]">
                    {m.headline}
                  </h3>

                  <p className="mt-4 text-[13.5px] leading-[1.55] text-foreground/65">
                    {m.summary}
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-4 border-t border-border-soft pt-4">
                    <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.14em] text-foreground/45">
                      {m.source}
                    </span>
                    <span
                      aria-hidden
                      className="inline-flex items-center text-[18px] text-primary transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
