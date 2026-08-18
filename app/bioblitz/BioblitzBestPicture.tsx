"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CameraIcon, CrownIcon, HeartIcon, LeafIcon } from "lucide-react";
import { RecordDrawer } from "../_components/RecordDrawer";
import { AuthorInline } from "../_components/AuthorChip";
import { formatNumber } from "../_lib/format";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import {
  BIOBLITZ_PRIZES,
  fetchRoundTopLiked,
  type BioblitzRound,
  type LikedObservation,
} from "../_lib/bioblitz";
import type { ExplorerRecord } from "../_lib/indexer";

// "Best picture front-runners" — the photo sightings drawing the most community
// likes inside the featured round's window. The best-picture prize is judged
// once the round closes, so this section shows who's currently in the running.
// Reuses fetchRoundObservations under the hood (shared 24h cache with the map +
// gallery) and tallies app.gainforest.feed.like records per sighting. Clicking a
// card opens the same sighting drawer used across the app.

// How many front-runners to show.
const TOP_LIMIT = 3;

type Phase = "loading" | "ready" | "error";

export function BioblitzBestPicture({ round }: { round: BioblitzRound }) {
  const t = useTranslations("marketplace.bioblitz.bestPicture");
  const locale = useLocale();
  const [entries, setEntries] = useState<LikedObservation[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    setEntries([]);
    fetchRoundTopLiked(round, TOP_LIMIT, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setEntries(result);
        setPhase("ready");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setPhase("error");
      });
    return () => controller.abort();
  }, [round]);

  const prize = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(BIOBLITZ_PRIZES.bestPicture);

  return (
    <section>
      <div aria-hidden className="mx-auto h-px w-full max-w-6xl bg-border/60" />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-start gap-2">
              <span className="mt-1 flex size-5 items-center justify-center text-primary [&_svg]:size-4">
                <CameraIcon aria-hidden />
              </span>
              <h2 className="font-instrument text-2xl font-light italic leading-tight text-foreground">
                {t("heading")}
              </h2>
            </div>
            <p className="mt-1 max-w-xl text-sm leading-snug text-muted-foreground">{t("subtitle")}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <CameraIcon className="size-3.5" aria-hidden />
            {t("prize", { amount: prize })}
          </span>
        </div>

        <div className="mt-5">
          {phase === "error" ? (
            <div className="rounded-2xl bg-foreground/5 px-6 py-14 text-center text-sm text-muted-foreground">
              {t("error")}
            </div>
          ) : phase === "loading" ? (
            <BestPictureSkeleton />
          ) : entries.length === 0 ? (
            <div className="rounded-2xl bg-foreground/5 px-6 py-14 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry, index) => (
                <BestPictureCard
                  key={entry.record.id}
                  entry={entry}
                  rank={index + 1}
                  onOpen={setDrawer}
                  t={t}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />
    </section>
  );
}

const RANK_BADGE: Record<number, string> = {
  1: "bg-primary text-primary-foreground",
  2: "bg-slate-400/30 text-slate-700 dark:text-slate-200",
  3: "bg-orange-400/25 text-orange-800 dark:text-orange-200",
};

function BestPictureCard({
  entry,
  rank,
  onOpen,
  t,
}: {
  entry: LikedObservation;
  rank: number;
  onOpen: (record: ExplorerRecord) => void;
  t: ReturnType<typeof useTranslations<"marketplace.bioblitz.bestPicture">>;
}) {
  const { record, likeCount } = entry;
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
    <li>
      <button
        type="button"
        onClick={() => onOpen(record)}
        aria-label={t("openPhoto", { name: name ?? t("unnamed") })}
        className="group relative flex w-full flex-col overflow-hidden rounded-2xl bg-surface-sunken text-left outline-none ring-1 ring-border/60 transition duration-300 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.55)] focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {hasImage ? (
            <Image
              src={url!}
              alt={name ?? ""}
              fill
              sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
              unoptimized={!isPdsBlobUrl(url)}
              onError={() => setImgError(true)}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-primary/25">
              <LeafIcon className="size-10" strokeWidth={1.25} aria-hidden />
            </div>
          )}

          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${RANK_BADGE[rank] ?? "bg-background/90 text-foreground"}`}
          >
            {rank === 1 ? <CrownIcon className="size-3.5" aria-hidden /> : `#${rank}`}
            {rank === 1 ? t("leader") : null}
          </span>

          <span
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground"
            aria-label={t("likes", { count: likeCount })}
          >
            <HeartIcon className="size-3.5 fill-primary text-primary" aria-hidden />
            <span className="tabular-nums">{formatNumber(likeCount)}</span>
          </span>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
          {name ? (
            <p className="absolute inset-x-0 bottom-0 truncate p-3 font-instrument text-lg italic leading-tight text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
              {name}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-sm">
            <AuthorInline did={record.did} nameOverride={record.creatorName} avatarRefOverride={record.creatorAvatarRef} />
          </span>
          {place ? <p className="truncate text-xs text-muted-foreground">{place}</p> : null}
        </div>
      </button>
    </li>
  );
}

function BestPictureSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: TOP_LIMIT }).map((_, index) => (
        <li key={index} className="overflow-hidden rounded-2xl ring-1 ring-border/60">
          <div className="aspect-[4/3] w-full animate-pulse bg-foreground/5" />
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="h-4 w-28 animate-pulse rounded bg-foreground/5" />
            <div className="h-4 w-10 animate-pulse rounded bg-foreground/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}
