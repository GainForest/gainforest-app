"use client";

import Link from "next/link";
import type { LiveBumicertsSnapshot, LiveBumicert } from "../../_lib/bumicerts";
import { BUMICERTS_URL } from "../../_lib/urls";
import { useLocale } from "../../_components/LocaleProvider";
import { getExplorerT } from "../_messages";

// Horizontal marquee of the freshest high-quality Bumicerts.
//
// Direct React port of the swissnex-2026 deck's "streaming live"
// slide (slide 8) ; same card recipe, same seamless-loop trick, same
// hover-to-pause behaviour. The deck baked the snapshot at build
// time to sidestep hyperlabel's missing CORS headers; here the page
// is server-rendered so the indexer call happens on the server and
// the React tree just walks the resolved snapshot.
//
// The marquee track contains TWO identical copies of the card set.
// `translateX(-50%)` (driven by the `.stream-marquee-track`
// animation in globals.css) lands the start of the duplicate copy
// exactly where the original began ; no visible seam.
//
// Mounted by `<ExplorerPage />`, with the same snapshot the landing
// page uses (high-quality tier from hyperlabel, sorted createdAt
// DESC). When `snapshot.fromFallback === true` we still render ;
// the fallback snapshot has 3 entries which is just enough for the
// duplicate-set loop to feel like a band rather than a few stranded
// cards.

const INTL_LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  sw: "sw-KE",
  id: "id-ID",
};

export function BumicertsMarquee({ snapshot }: { snapshot: LiveBumicertsSnapshot }) {
  const { locale } = useLocale();
  const t = getExplorerT(locale);
  const intlLocale = INTL_LOCALES[locale] ?? "en-US";

  // Sort newest-first and prefer image-bearing entries up front so the
  // first slide of the band is always visually solid.
  const sorted = [...snapshot.bumicerts].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const withImage = sorted.filter((b) => b.imageUrl);
  const cards = (withImage.length >= 6 ? withImage : sorted).slice(0, 12);

  return (
    <section className="relative bg-background">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-12 sm:px-10 lg:px-16 lg:pt-16">
        <div className="grid grid-cols-12 items-end gap-6">
          <div className="col-span-12 lg:col-span-8">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("explorer.bumicerts.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[34px] sm:text-[42px] lg:text-[54px] font-normal leading-[1.05] tracking-[-0.015em] text-foreground">
              {t("explorer.bumicerts.heading.before")}{" "}
              <span className="font-instrument italic">
                {t("explorer.bumicerts.heading.italic")}
              </span>
              {t("explorer.bumicerts.heading.after")}
            </h2>
            <p className="mt-5 max-w-[640px] text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/75">
              {t("explorer.bumicerts.lede")}
            </p>
          </div>
          <div className="col-span-12 flex flex-col items-start gap-3 lg:col-span-4 lg:items-end">
            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
            >
              {t("explorer.bumicerts.cta")}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Marquee band ; hairline rules above + below frame the data
          stripe so it reads as a deliberate cut in the page. */}
      {cards.length > 0 ? (
        <div
          className="stream-marquee mt-8 border-y border-border-soft py-6 lg:mt-10"
          aria-label={t("explorer.bumicerts.eyebrow")}
        >
          <ul role="list" className="stream-marquee-track">
            {cards.map((c) => (
              <BumicertCard key={c.id} bumicert={c} locale={intlLocale} />
            ))}
            {/* Duplicate copy ; hidden from screen readers; lives
                purely to make the marquee loop seamlessly when the
                track translates -50%. */}
            {cards.map((c) => (
              <BumicertCard
                key={`dup-${c.id}`}
                bumicert={c}
                locale={intlLocale}
                ariaHidden
              />
            ))}
          </ul>
        </div>
      ) : (
        <div className="mx-auto max-w-[1480px] px-6 py-8 text-center font-instrument italic text-[14px] text-foreground/55 sm:px-10 lg:px-16">
          {t("explorer.bumicerts.empty")}
        </div>
      )}

      <p className="mx-auto max-w-[1480px] px-6 pt-4 pb-12 text-center font-instrument italic text-[13px] text-foreground/55 sm:px-10 lg:px-16 lg:pb-16">
        {t("explorer.bumicerts.hint")}
      </p>
    </section>
  );
}

function BumicertCard({
  bumicert,
  locale,
  ariaHidden,
}: {
  bumicert: LiveBumicert;
  locale: string;
  ariaHidden?: boolean;
}) {
  const dateStr = formatShortDate(bumicert.createdAt, locale);
  const atUri = truncateAtUri(
    `at://${bumicert.did}/org.hypercerts.claim.activity/${bumicert.rkey}`,
  );

  // Card itself is a real link to the Bumicert page when the indexer
  // returned a usable record; fallback rows can be dead targets so
  // we still want the visual card but don't want a broken click. The
  // shared `href` is set by `fetchLiveBumicerts()` so we just trust
  // it here.
  return (
    <li
      aria-hidden={ariaHidden}
      className="flex shrink-0"
      style={{ width: "clamp(220px, 22vw, 320px)" }}
    >
      <Link
        href={bumicert.href}
        target="_blank"
        rel="noreferrer"
        tabIndex={ariaHidden ? -1 : 0}
        className="group flex w-full flex-col overflow-hidden rounded-[14px] border border-border-soft bg-background shadow-[0_8px_26px_-18px_rgba(20,30,15,0.35)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.45)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#e1dccf]">
          <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-brand-dark">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-pulse"
            />
            Live
          </span>
          {bumicert.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bumicert.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[12px] italic text-foreground/45">
              No image
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 px-4 pb-3.5 pt-3">
          <div
            className="font-garamond text-[16px] leading-[1.2] text-foreground"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
          >
            {bumicert.title || "Untitled bumicert"}
          </div>
          {bumicert.shortDescription && (
            <div
              className="font-instrument italic text-[12.5px] leading-[1.4] text-foreground/65"
              style={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
              }}
            >
              {bumicert.shortDescription}
            </div>
          )}
          <div className="mt-auto flex flex-col gap-1 border-t border-border-soft pt-2.5">
            <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.08em] text-foreground/55">
              <span>{dateStr}</span>
              <span>ATProto</span>
            </div>
            <div
              className="truncate font-mono text-[10.5px] tracking-tight text-primary"
              title={atUri.full}
            >
              {atUri.short}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function formatShortDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

function truncateAtUri(uri: string): { short: string; full: string } {
  const m = uri.match(/^at:\/\/(did:plc:)([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return { short: uri, full: uri };
  const [, prefix, did, , rkey] = m;
  const short = `at://${prefix}${did.slice(0, 5)}…${did.slice(-4)}/…/${rkey.slice(-7)}`;
  return { short, full: uri };
}
