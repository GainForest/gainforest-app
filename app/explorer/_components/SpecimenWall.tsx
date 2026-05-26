"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../_components/LocaleProvider";
import { getExplorerT } from "../_messages";
import {
  walkOccurrences,
  type LiveOccurrence,
} from "../_lib/fetch-occurrences-client";

// Two-row specimen wall of Darwin Core occurrences ; client-rendered.
//
// Direct React port of the swissnex-2026 deck's "specimen wall"
// slide (slide 9). The two rows scroll in opposite directions
// (top → left, bottom → right) so the wall reads as one editorial
// ticker rather than a single conveyor belt. Hover anywhere on the
// wall pauses both rows together (same recipe as
// `.stream-marquee`); the CSS lives in `app/globals.css`.
//
// Why client-side, not server: the indexer's newest pages are heavily
// skewed toward auto-uploaded sensor records with `imageEvidence: null`.
// Finding ~30 image-bearing records requires walking 1500-3000 records
// at ~6 s per page ; that blows past Vercel's 60s static-generation
// timeout for the page. Doing the walk in the visitor's browser lets
// the page render instantly and the wall fill in progressively.
//
// `walkOccurrences` emits records via `onProgress` as soon as each
// page's matches are resolved, so the wall starts filling in well
// before the full walk completes.

const INTL_LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  sw: "sw-KE",
  id: "id-ID",
};

/** Number of image-bearing Darwin Core records to fetch into the
 *  wall. Deep enough that the right-rail taxa tally and the rolling
 *  marquee don't read as a small outlier sample. The walker emits
 *  records progressively as each indexer page resolves so the wall
 *  fills in long before the full target lands. */
const TARGET = 200;

export function SpecimenWall({ occurrencesTotal }: { occurrencesTotal: number }) {
  const { locale } = useLocale();
  const t = getExplorerT(locale);
  const intlLocale = INTL_LOCALES[locale] ?? "en-US";
  const fmt = new Intl.NumberFormat(intlLocale);

  const [records, setRecords] = useState<LiveOccurrence[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  // Latest progress count is held in a ref so the loading state can
  // surface it without re-rendering the whole wall on each emit.
  const progressRef = useRef(0);
  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    walkOccurrences({
      target: TARGET,
      signal: controller.signal,
      onProgress: (running) => {
        if (cancelled) return;
        progressRef.current = running.length;
        setRecords(running);
        // Cheap re-render of the loading copy without churning the
        // wall itself ; the records state already triggered that.
        setProgressTick((n) => n + 1);
      },
    })
      .then((final) => {
        if (cancelled) return;
        setRecords(final);
        setPhase("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if ((err as Error).name === "AbortError") return;
        console.warn("[explorer] occurrence walk failed", err);
        setPhase("error");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const taxa = new Set(records.map((r) => r.scientificName).filter((v) => v))
    .size;

  // Interleave records across the two rows so each is its own sample
  // of the feed (not first-half / second-half of the same list).
  // Mirrors the deck's behaviour.
  const evens = records.filter((_, i) => i % 2 === 0);
  const odds = records.filter((_, i) => i % 2 === 1);

  return (
    <section className="relative bg-[#fbf8f0]" id="specimens">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-16 sm:px-10 lg:px-16 lg:pt-24">
        <div className="grid grid-cols-12 items-end gap-6 lg:gap-10">
          <div className="col-span-12 lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("explorer.specimens.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[34px] sm:text-[42px] lg:text-[54px] font-normal leading-[1.05] tracking-[-0.015em] text-foreground">
              {t("explorer.specimens.heading.before")}{" "}
              <span className="font-instrument italic">
                {t("explorer.specimens.heading.italic")}
              </span>
              {t("explorer.specimens.heading.after")}
            </h2>
            <p className="mt-5 max-w-[640px] text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/75">
              {t("explorer.specimens.lede")}
            </p>
          </div>

          {/* Right rail ; layered stats that are honest about the
              wall being a sample, not the full collection:

                42         unique taxa                  ← from sample
                across the 200 most-recent image-bearing records
                417,229 indexed in app.gainforest.dwc.occurrence

              The big garamond number is the in-browser sample
              count of unique scientific names. The two small lines
              below frame it ; one names the sample size, the next
              names the global indexer total. We no longer surface
              a "communities issuing records" tally because the
              client-side walk only sees the latest image-bearing
              uploads (currently 2-3 communities) which dramatically
              under-counts the actual partner network. The hero KPI
              shows the honest partner count from Green Globe.

              Skeleton holds the slot until the first page resolves. */}
          <div className="col-span-12 flex flex-col items-start gap-2 lg:col-span-5 lg:items-end">
            {phase === "loading" && records.length === 0 ? (
              <SkeletonStats />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-garamond text-[28px] sm:text-[32px] lg:text-[36px] font-medium leading-none text-foreground">
                    {fmt.format(taxa)}
                  </span>
                  <span className="font-instrument italic text-[14px] text-foreground/65 lg:text-[15px]">
                    {t("explorer.specimens.taxa")}
                  </span>
                </div>
                <div className="text-[13px] leading-[1.4] text-foreground/65 lg:max-w-[320px] lg:text-right">
                  {t("explorer.specimens.acrossRecent").replace(
                    "{sample}",
                    fmt.format(records.length),
                  )}
                </div>
                <div className="text-[12.5px] leading-[1.4] text-foreground/55 lg:text-right">
                  {t("explorer.specimens.indexedTotal").replace(
                    "{total}",
                    fmt.format(occurrencesTotal),
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* The wall itself. Renders a skeleton band while we wait for
          the first batch of records to arrive, then swaps to real
          rows ; subsequent records stream in card-by-card via the
          `onProgress` callback below, so the wall grows without
          ever resetting to a skeleton state. */}
      <div
        className="spec-wall mt-10 border-y border-border-soft py-3 lg:mt-14"
        aria-label={t("explorer.specimens.eyebrow")}
        aria-busy={phase === "loading"}
        style={{ height: "calc(2 * clamp(140px, 16vw, 200px) + 1.6rem)" }}
      >
        {records.length === 0 ? (
          <SkeletonWall />
        ) : (
          <>
            <SpecimenRow
              records={evens.length ? evens : records}
              direction="left"
              unidentifiedLabel={t("explorer.specimens.unidentified")}
            />
            <div className="h-2" />
            <SpecimenRow
              records={odds.length ? odds : records}
              direction="right"
              unidentifiedLabel={t("explorer.specimens.unidentified")}
            />
          </>
        )}
      </div>

      <p className="mx-auto max-w-[1480px] px-6 pt-4 pb-16 text-center font-instrument italic text-[13px] text-foreground/55 sm:px-10 lg:px-16 lg:pb-24">
        {phase === "loading"
          ? t("explorer.specimens.loading")
              .replace("{loaded}", fmt.format(progressRef.current))
              .replace("{target}", fmt.format(TARGET))
          : phase === "error"
            ? t("explorer.specimens.empty")
            : t("explorer.specimens.hint")}
        {/* progressTick is only here to make the eslint deps-check
            happy ; rendering uses progressRef directly. */}
        <span hidden>{progressTick}</span>
      </p>
    </section>
  );
}

function SpecimenRow({
  records,
  direction,
  unidentifiedLabel,
}: {
  records: LiveOccurrence[];
  direction: "left" | "right";
  unidentifiedLabel: string;
}) {
  if (records.length === 0) return null;

  return (
    <div className="spec-row" style={{ height: "clamp(140px, 16vw, 200px)" }}>
      <div
        className={`spec-track ${direction === "left" ? "spec-track-left" : "spec-track-right"}`}
      >
        {records.map((r, i) => (
          <SpecimenCard
            key={r.id}
            record={r}
            unidentifiedLabel={unidentifiedLabel}
            // Eager-load the first 8 images in each row so the wall
            // paints with real content as soon as cards are present
            // in the DOM. Anything further down can wait for the
            // browser's native lazy-load.
            eager={i < 8}
          />
        ))}
        {records.map((r) => (
          <SpecimenCard
            key={`dup-${r.id}`}
            record={r}
            unidentifiedLabel={unidentifiedLabel}
            ariaHidden
          />
        ))}
      </div>
    </div>
  );
}

function SpecimenCard({
  record,
  unidentifiedLabel,
  ariaHidden,
  eager,
}: {
  record: LiveOccurrence;
  unidentifiedLabel: string;
  ariaHidden?: boolean;
  /** Set `true` for the first few cards in a row so the browser
   *  fetches the image immediately rather than waiting for it to
   *  scroll into view. The marquee starts paused for a few hundred
   *  ms while the JS bundle hydrates, so lazy-loading would leave
   *  the wall looking empty for that whole window. */
  eager?: boolean;
}) {
  const sci = record.scientificName || record.vernacularName || unidentifiedLabel;
  const cc =
    record.countryCode ||
    (record.country ? record.country.slice(0, 2).toUpperCase() : "");
  const coord = formatCoord(record.lat, record.lon);

  return (
    <article
      aria-hidden={ariaHidden}
      className="relative aspect-square h-full shrink-0 overflow-hidden rounded-lg border border-border-soft bg-[#e1dccf] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_rgba(20,30,15,0.4)]"
    >
      {record.iucn && (
        <span
          className="absolute right-1.5 top-1.5 z-20 rounded-full bg-background/95 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-primary-dark"
          title={`IUCN ${record.iucn}`}
        >
          {record.iucn}
        </span>
      )}
      {/* next/image routes through Vercel's image optimizer
          (/_next/image) which:
            1. Resizes the original PDS blob (often 1500×2000 ≈ 200 KB)
               down to the actual rendered size (≈ 200 × 200 = 20 KB).
            2. Re-encodes as WebP/AVIF.
            3. Caches on Vercel's edge so a popular record loads from
               the CDN, not from each community's PDS, on subsequent
               visitors. Without this, every visitor was hitting
               certified.one with 200 KB unoptimised JPEGs over a
               ~1.3 s TTFB each. */}
      <Image
        src={record.imageUrl}
        alt={ariaHidden ? "" : sci}
        fill
        sizes="(max-width: 768px) 140px, (max-width: 1280px) 16vw, 200px"
        priority={eager}
        unoptimized={record.imageUrl.startsWith("/")}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
        style={{ objectFit: "cover" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-0.5 px-2 pb-1.5 pt-2.5"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(20,20,18,0.55) 45%, rgba(20,20,18,0.85) 100%)",
        }}
      >
        <div
          className="font-instrument italic text-[11.5px] leading-[1.15] text-[#f4efe4]"
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
          title={sci}
        >
          {sci}
        </div>
        <div className="flex items-baseline justify-between font-mono text-[9.5px] text-[#f4efe4]/80">
          <span>{coord}</span>
          {cc && <span className="text-brand">{cc}</span>}
        </div>
      </div>
    </article>
  );
}

// ── Loading skeletons ──────────────────────────────────────────────

function SkeletonStats() {
  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <div className="h-9 w-32 animate-pulse rounded bg-foreground/[0.08]" />
      <div className="h-4 w-48 animate-pulse rounded bg-foreground/[0.06]" />
    </div>
  );
}

function SkeletonWall() {
  // 8 + 8 placeholder cards across two rows; just enough to give the
  // band the right visual weight while the first indexer page is
  // still in flight.
  const cells = Array.from({ length: 8 });
  return (
    <>
      <div className="spec-row" style={{ height: "clamp(140px, 16vw, 200px)" }}>
        <div className="spec-track">
          {cells.map((_, i) => (
            <SkeletonCard key={`top-${i}`} />
          ))}
        </div>
      </div>
      <div className="h-2" />
      <div className="spec-row" style={{ height: "clamp(140px, 16vw, 200px)" }}>
        <div className="spec-track">
          {cells.map((_, i) => (
            <SkeletonCard key={`bot-${i}`} />
          ))}
        </div>
      </div>
    </>
  );
}

function SkeletonCard() {
  return (
    <div
      className="relative aspect-square h-full shrink-0 animate-pulse overflow-hidden rounded-lg border border-border-soft bg-[#e8e2d2]"
    />
  );
}

function formatCoord(lat: number | null, lon: number | null): string {
  if (lat == null || lon == null) return "";
  return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}
