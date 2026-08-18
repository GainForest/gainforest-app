"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagesIcon, LeafIcon } from "lucide-react";
import { RecordDrawer } from "../_components/RecordDrawer";
import { QuickLikeButton, QuickLikeProvider } from "../_components/QuickLike";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { fetchRoundObservations, type BioblitzRound } from "../_lib/bioblitz";
import type { ExplorerRecord, OccurrenceRecord } from "../_lib/indexer";

// A live photo wall of the sightings uploaded during the featured round — the
// same idea as plresearch.org's live-impact carousel, scoped to BioBlitz. Two
// rows of square cards auto-scroll in opposite directions (CSS marquee), each
// card resolving its PDS blob image in the browser. Clicking a photo opens the
// shared sighting drawer, the same preview used by the map and explorer.
//
// The wall is great for atmosphere but scrolls on its own, so it's hard to take
// stock of everything submitted. A "All submissions" view switches the same set
// into a static, browsable grid where every sighting can be opened, liked and
// commented on (the drawer carries the same like + comment bar as the feed).
//
// Reuses `fetchRoundObservations` (the exact call the map already makes), so the
// 24h public-explore cache serves both with a single network round-trip.

// How many of the newest photos to show on the scrolling wall.
const WALL_LIMIT = 60;
// Below this, a static centred row reads better than a sparse marquee.
const MARQUEE_MIN = 8;

type Phase = "loading" | "ready" | "error";
type View = "wall" | "all";

export function BioblitzGallery({ round }: { round: BioblitzRound }) {
  const t = useTranslations("marketplace.bioblitz.gallery");
  const [records, setRecords] = useState<OccurrenceRecord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<View>("wall");
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    setRecords([]);
    fetchRoundObservations(round, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        // Already photos-only and newest-first inside the round window.
        setRecords(result);
        setPhase("ready");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setPhase("error");
      });
    return () => controller.abort();
  }, [round]);

  // The scrolling wall shows the newest slice; the grid shows everything.
  const wallRecords = records.slice(0, WALL_LIMIT);
  const rowA = wallRecords.filter((_, index) => index % 2 === 0);
  const rowB = wallRecords.filter((_, index) => index % 2 === 1);
  const animate = wallRecords.length >= MARQUEE_MIN;
  const hasRecords = phase === "ready" && records.length > 0;

  return (
    <section>
      <div aria-hidden className="mx-auto h-px w-full max-w-6xl bg-border/60" />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-5 items-center justify-center text-primary [&_svg]:size-4">
                <ImagesIcon aria-hidden />
              </span>
              <h2 className="font-instrument text-2xl font-light italic leading-tight text-foreground">
                {t("heading")}
              </h2>
              {hasRecords ? (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {t("count", { count: records.length })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-xl text-sm leading-snug text-muted-foreground">
              {view === "all" ? t("subtitleAll") : t("subtitle")}
            </p>
          </div>
          {hasRecords ? <ViewToggle view={view} onView={setView} t={t} /> : null}
        </div>

        <div className="mt-5">
          {phase === "error" ? (
            <div className="rounded-2xl bg-foreground/5 px-6 py-14 text-center text-sm text-muted-foreground">
              {t("error")}
            </div>
          ) : phase === "loading" ? (
            <GallerySkeleton />
          ) : records.length === 0 ? (
            <div className="rounded-2xl bg-foreground/5 px-6 py-14 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : view === "all" ? (
            /* Quick like: the static grid gets a heart on each thumbnail (the
               auto-scrolling wall doesn't — moving targets invite misclicks). */
            <QuickLikeProvider uris={records.map((record) => record.atUri)}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {records.map((record) => (
                  <li key={record.id}>
                    <GalleryCard record={record} onOpen={setDrawer} t={t} sizeClassName="aspect-square w-full" quickLike />
                  </li>
                ))}
              </ul>
            </QuickLikeProvider>
          ) : (
            <div className="bioblitz-marquee relative overflow-hidden">
              <MarqueeRow items={rowA} dir="left" animate={animate} onOpen={setDrawer} t={t} />
              <div className="h-3" aria-hidden />
              <MarqueeRow items={rowB} dir="right" animate={animate} onOpen={setDrawer} t={t} />
              {/* Soft fade at both edges so cards slide in and out, not pop. */}
              <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent sm:w-20" />
              <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent sm:w-20" />
            </div>
          )}
        </div>
      </div>

      <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />
    </section>
  );
}

function ViewToggle({
  view,
  onView,
  t,
}: {
  view: View;
  onView: (view: View) => void;
  t: ReturnType<typeof useTranslations<"marketplace.bioblitz.gallery">>;
}) {
  const options: View[] = ["wall", "all"];
  return (
    <div className="inline-flex shrink-0 rounded-full bg-muted/60 p-0.5">
      {options.map((option) => {
        const selected = view === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onView(option)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`view.${option}`)}
          </button>
        );
      })}
    </div>
  );
}

function MarqueeRow({
  items,
  dir,
  animate,
  onOpen,
  t,
}: {
  items: OccurrenceRecord[];
  dir: "left" | "right";
  animate: boolean;
  onOpen: (record: ExplorerRecord) => void;
  t: ReturnType<typeof useTranslations<"marketplace.bioblitz.gallery">>;
}) {
  if (items.length === 0) return null;
  // Render twice so the -50% marquee translate loops seamlessly.
  const sequence = animate ? [...items, ...items] : items;
  const trackClass = animate
    ? `bioblitz-marquee-track ${dir === "left" ? "bioblitz-marquee-left" : "bioblitz-marquee-right"} inline-flex h-36 gap-3`
    : "flex h-36 flex-wrap justify-center gap-3";
  return (
    <div className="h-36 overflow-hidden">
      <div className={trackClass}>
        {sequence.map((record, index) => (
          <GalleryCard key={`${record.id}-${index}`} record={record} onOpen={onOpen} t={t} />
        ))}
      </div>
    </div>
  );
}

function GalleryCard({
  record,
  onOpen,
  t,
  sizeClassName = "aspect-square h-full shrink-0",
  quickLike = false,
}: {
  record: OccurrenceRecord;
  onOpen: (record: ExplorerRecord) => void;
  t: ReturnType<typeof useTranslations<"marketplace.bioblitz.gallery">>;
  sizeClassName?: string;
  quickLike?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(record.imageUrl);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setUrl(record.imageUrl);
    setImgError(false);
    if (record.imageUrl || !record.imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(record.did, record.imageRef, controller.signal)
      .then((resolved) => setUrl(resolved))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setUrl(null);
      });
    return () => controller.abort();
  }, [record.did, record.imageRef, record.imageUrl]);

  const name = record.vernacularName || record.scientificName || null;
  const place = [record.locality, record.country].filter(Boolean).join(", ") || null;
  const hasImage = Boolean(url) && !imgError;

  return (
    // div+role rather than <button> so the quick-like heart (itself a button)
    // can legally nest inside the clickable card.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(record)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(record);
        }
      }}
      title={name ?? undefined}
      aria-label={t("openPhoto", { name: name ?? t("unnamed") })}
      className={`group relative block ${sizeClassName} cursor-pointer overflow-hidden rounded-2xl bg-surface-sunken text-left outline-none transition duration-300 hover:z-10 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.55)] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary/60`}
    >
      {hasImage ? (
        <Image
          src={url!}
          alt={name ?? ""}
          fill
          sizes="160px"
          unoptimized={!isPdsBlobUrl(url)}
          onError={() => setImgError(true)}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-primary/25">
          <LeafIcon className="size-8" strokeWidth={1.25} aria-hidden />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

      {quickLike ? <QuickLikeButton subjectUri={record.atUri} className="absolute bottom-2 right-2" /> : null}

      <div className={`absolute inset-x-0 bottom-0 p-2 ${quickLike ? "pr-10" : ""}`}>
        {name ? (
          <p className="truncate font-instrument text-[13px] italic leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {name}
          </p>
        ) : null}
        {place ? <p className="truncate text-[10px] leading-tight text-white/70">{place}</p> : null}
      </div>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((row) => (
        <div key={row} className="flex h-36 gap-3 overflow-hidden">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="aspect-square h-full shrink-0 animate-pulse rounded-2xl bg-foreground/5" />
          ))}
        </div>
      ))}
    </div>
  );
}
