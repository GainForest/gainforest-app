"use client";

import Link from "next/link";
import { useT, useLocale } from "./LocaleProvider";
import type { BlogPost } from "../_lib/blog";
import type { MessageKey } from "../_lib/i18n";

// "Awards & press." — horizontal editorial carousel.
//
// Each item is a real external source: awards, press releases,
// documentaries, talks, and recent blog posts. We keep the cards
// text-only (no thumbnails) so the section stays in the same
// restrained editorial system as the rest of the page: cream cards,
// Garamond headlines, tracking-wide metadata, one arrow affordance.
//
// Curated press items are localised through i18n keys
// (`media.items.<slug>.headline` / `.summary` and `media.kind.<kind>`)
// so the carousel reads native in every locale. Blog posts arrive at
// runtime through `fetchSubstackPosts()` and stay in their source
// language — Substack feed contents change over time and translating
// them per locale is not viable on a static landing.
//
// Research notes for the curated items live in
// `app/_lib/i18n.ts` next to the translations; the slugs below map
// 1:1 to those keys.

type CuratedKind =
  | "award"
  | "press"
  | "documentary"
  | "launch"
  | "grant"
  | "hackathon"
  | "talk"
  | "podcast"
  | "feature";

type CuratedSlug =
  | "simocracy"
  | "klarna"
  | "bhutan"
  | "changenow"
  | "cna"
  | "atmos"
  | "ftc"
  | "maearth"
  | "xprize"
  | "swissnex"
  | "bcg"
  | "mades";

type CuratedItem = {
  slug: CuratedSlug;
  kind: CuratedKind;
  /** ISO date for sorting + locale-aware formatting. */
  sortDate: string;
  source: string;
  href: string;
  /** Cover image path under /public/decor/news/<slug>.jpg. */
  image: string;
};

// Source provenance for each curated cover image lives in
// `scripts/news-covers.sh` (download list). 10/12 are real article
// thumbnails (YouTube maxresdefault / og:image / Substack cover) and
// the two that the publisher couldn't expose (Klarna investor page,
// MADES press page) are stylised covers generated via gpt-image-2 in
// the GainForest editorial palette.
const CURATED_ITEMS: ReadonlyArray<CuratedItem> = [
  {
    slug: "simocracy",
    kind: "launch",
    sortDate: "2026-05-14",
    source: "Funding the Commons",
    href: "https://www.youtube.com/watch?v=kdwHnRJUtTg",
    image: "/decor/news/simocracy.jpg",
  },
  {
    slug: "klarna",
    kind: "grant",
    sortDate: "2025-12-04",
    source: "Klarna",
    href: "https://investors.klarna.com/News--Events/news/news-details/2025/Klarna-Launches-Global-AI-for-Climate-Resilience-Program-to-Empower-Communities-on-the-Climate-Frontlines/default.aspx",
    image: "/decor/news/klarna.jpg",
  },
  {
    slug: "bhutan",
    kind: "hackathon",
    sortDate: "2025-06-28",
    source: "Kuensel",
    href: "https://kuenselonline.com/news/team-cyberchain-and-deepgov-win-bhutan-ndi-powered-international-hackathon",
    image: "/decor/news/bhutan.jpg",
  },
  {
    slug: "changenow",
    kind: "talk",
    sortDate: "2025-05-07",
    source: "ChangeNOW",
    href: "https://www.youtube.com/watch?v=_GBdtdGdPJU",
    image: "/decor/news/changenow.jpg",
  },
  {
    slug: "cna",
    kind: "documentary",
    sortDate: "2025-03-08",
    source: "CNA Insider",
    href: "https://www.youtube.com/watch?v=SsWzsL03d5M",
    image: "/decor/news/cna.jpg",
  },
  {
    slug: "atmos",
    kind: "feature",
    sortDate: "2025-02-25",
    source: "Atmos",
    href: "https://atmos.earth/political-landscapes/indigenous-groups-are-safeguarding-culture-with-their-own-chatgpt/",
    image: "/decor/news/atmos.jpg",
  },
  {
    slug: "ftc",
    kind: "talk",
    sortDate: "2025-02-17",
    source: "Funding the Commons",
    href: "https://www.youtube.com/watch?v=KbiXWl8ZDVY",
    image: "/decor/news/ftc.jpg",
  },
  {
    slug: "maearth",
    kind: "podcast",
    sortDate: "2025-01-09",
    source: "Ma Earth",
    href: "https://www.youtube.com/watch?v=9Ei-L_sBDSk",
    image: "/decor/news/maearth.jpg",
  },
  {
    slug: "xprize",
    kind: "award",
    sortDate: "2024-11-15",
    source: "XPRIZE",
    href: "https://www.xprize.org/competitions/rainforest",
    image: "/decor/news/xprize.jpg",
  },
  {
    slug: "swissnex",
    kind: "press",
    sortDate: "2024-09-01",
    source: "Swissnex Brazil",
    href: "https://swissnex.org/brazil/news/switzerland-and-amazonia-together-for-a-thriving-planet/",
    image: "/decor/news/swissnex.jpg",
  },
  {
    slug: "bcg",
    kind: "award",
    sortDate: "2022-11-03",
    source: "BCG & Handelsblatt",
    href: "https://www.handelsblatt.com/unternehmen/management/vordenker_innen/vordenker-ernaehrung-und-landwirtschaft-besser-essen-fuer-das-weltklima/28848280.html",
    image: "/decor/news/bcg.jpg",
  },
  {
    slug: "mades",
    kind: "press",
    sortDate: "2022-04-12",
    source: "MADES Paraguay",
    href: "https://www.mades.gov.py/2022/04/12/mades-recibe-apoyo-para-fortalecimiento-de-areas-protegidas-en-el-chaco/",
    image: "/decor/news/mades.jpg",
  },
];

// Locale codes for Intl.DateTimeFormat. The i18n locale codes are
// short ("en", "es", "pt", "sw", "id") so we map them to BCP 47 region
// tags that produce nice month names in each language.
const INTL_LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  sw: "sw-KE",
  id: "id-ID",
};

// Runtime row type: every card in the carousel — curated or blog —
// renders through this single shape after we merge by date.
type Row = {
  key: string;
  sortDate: string;
  kindLabel: string;
  source: string;
  headline: string;
  summary: string;
  href: string;
  imageUrl: string | null;
};

export function Media({ blogPosts }: { blogPosts: ReadonlyArray<BlogPost> }) {
  const t = useT();
  const { locale } = useLocale();
  const intlLocale = INTL_LOCALES[locale] ?? "en-US";
  const dateFmt = new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const curatedRows: Row[] = CURATED_ITEMS.map((item) => ({
    key: `curated:${item.slug}`,
    sortDate: item.sortDate,
    kindLabel: t(`media.kind.${item.kind}` as MessageKey),
    source: item.source,
    headline: t(`media.items.${item.slug}.headline` as MessageKey),
    summary: t(`media.items.${item.slug}.summary` as MessageKey),
    href: item.href,
    imageUrl: item.image,
  }));

  const blogRows: Row[] = blogPosts.map((post) => ({
    key: `blog:${post.id}`,
    sortDate: post.publishedAt,
    kindLabel: t("media.kind.blog"),
    source: "GainForest Blog",
    headline: post.title,
    summary: post.summary,
    href: post.href,
    imageUrl: post.imageUrl,
  }));

  // Newest first, regardless of source.
  const rows: Row[] = [...curatedRows, ...blogRows].sort((a, b) =>
    a.sortDate < b.sortDate ? 1 : a.sortDate > b.sortDate ? -1 : 0,
  );

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
            {t("media.scroll")}
          </span>
        </div>

        <div className="relative mt-12">
          <ul
            className="media-card-carousel -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-6 pt-4 pb-10 sm:-mx-10 sm:px-10 lg:-mx-16 lg:gap-5 lg:px-16"
            role="list"
            aria-label={t("media.heading")}
          >
            {rows.map((row, i) => (
              <li
                key={row.key}
                className="flex w-[286px] shrink-0 snap-start sm:w-[330px] lg:w-[360px]"
              >
                <Link
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-h-[280px] w-full flex-col overflow-hidden rounded-[18px] border border-border-soft bg-background transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-26px_rgba(40,50,30,0.24)]"
                >
                  {/* Cover image — 16:9 crop, soft hover zoom. Falls
                      back to a sage-tinted plate if a blog post has
                      no enclosure image. */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#dde3d7]">
                    {row.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.imageUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                    ) : null}
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-foreground/15 via-transparent to-transparent" />
                    <span className="absolute right-3 top-3 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/65 backdrop-blur-sm">
                      {dateFmt.format(new Date(row.sortDate))}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
                      {String(i + 1).padStart(2, "0")} · {row.kindLabel}
                    </span>

                    <h3 className="mt-3 font-garamond text-[22px] font-normal leading-[1.1] text-foreground sm:text-[24px]">
                      {row.headline}
                    </h3>

                    <p className="mt-3 text-[13.5px] leading-[1.55] text-foreground/65">
                      {row.summary}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-4 border-t border-border-soft pt-4">
                      <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.14em] text-foreground/45">
                        {row.source}
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
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
