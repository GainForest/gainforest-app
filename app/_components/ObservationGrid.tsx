"use client";

import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AudioLinesIcon, CheckIcon, Layers3Icon, Loader2Icon, PauseIcon, PlayIcon, RulerIcon } from "lucide-react";
import {
  fetchObservationMeasurements,
  fetchObservationMediaCounts,
  summarizeObservationMeasurements,
  type ExplorerRecord,
  type ObservationMeasurementFact,
  type OccurrenceRecord,
} from "../_lib/indexer";
import { formatDate } from "../_lib/format";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { pauseOtherAudio, playExclusiveAudio, registerAudioElement } from "../_lib/audio-coordinator";
import { resolveDidProfile, getCachedProfile } from "../_lib/did-profile";
import { cn } from "@/lib/utils";

type ObservationSelection = {
  selectedIds: ReadonlySet<string>;
  onToggle: (record: OccurrenceRecord, selected: boolean) => void;
  getDisabledReason?: (record: OccurrenceRecord) => string | null;
};

export function ObservationGrid({
  records,
  onOpen,
  onFilterOwner,
  className,
  leadingCard,
  leadingCardClassName,
  selection,
  compact = false,
}: {
  records: OccurrenceRecord[];
  onOpen: (record: ExplorerRecord) => void;
  onFilterOwner?: (did: string) => void;
  className: string;
  leadingCard?: ReactNode;
  leadingCardClassName?: string;
  selection?: ObservationSelection;
  compact?: boolean;
}) {
  const counts = useObservationMediaCounts(records);
  const measurements = useObservationMeasurements(records);

  return (
    <ul role="list" className={className}>
      {leadingCard ? (
        <li className={cn("animate-in", leadingCardClassName)} style={{ animationDelay: "0ms" }}>
          {leadingCard}
        </li>
      ) : null}
      {records.map((record, index) => (
        <li key={record.id} className="animate-in" style={{ animationDelay: `${Math.min(index + (leadingCard ? 1 : 0), 12) * 18}ms` }}>
          <ObservationCard
            record={record}
            mediaCount={Math.max(counts.get(record.atUri) ?? 0, record.media.length)}
            measurements={measurements.get(record.atUri) ?? EMPTY_MEASUREMENTS}
            onOpen={onOpen}
            onFilterOwner={onFilterOwner}
            selection={selection}
            compact={compact}
          />
        </li>
      ))}
    </ul>
  );
}

const EMPTY_MEASUREMENTS: ObservationMeasurementFact[] = [];

// Field data (e.g. tree measurements) linked to the visible sightings, fetched
// in one batched round-trip and keyed by occurrence so each card can show its
// own measurements inline. Mirrors useObservationMediaCounts.
function useObservationMeasurements(records: OccurrenceRecord[]): Map<string, ObservationMeasurementFact[]> {
  const [facts, setFacts] = useState<Map<string, ObservationMeasurementFact[]>>(() => new Map());
  const refsKey = useMemo(() => records.map((record) => record.atUri).sort().join("\n"), [records]);

  useEffect(() => {
    if (!records.length) {
      setFacts(new Map());
      return;
    }
    const ctrl = new AbortController();
    fetchObservationMeasurements(records.map((record) => record.atUri), ctrl.signal)
      .then((byOccurrence) => {
        if (ctrl.signal.aborted) return;
        const next = new Map<string, ObservationMeasurementFact[]>();
        for (const [uri, items] of byOccurrence) {
          const summary = summarizeObservationMeasurements(items);
          if (summary.length > 0) next.set(uri, summary);
        }
        setFacts(next);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setFacts(new Map());
      });
    return () => ctrl.abort();
    // `refsKey` is the stable primitive dependency for the current record set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey]);

  return facts;
}

function useObservationMediaCounts(records: OccurrenceRecord[]): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
  const refsKey = useMemo(() => records.map((record) => record.atUri).sort().join("\n"), [records]);

  useEffect(() => {
    if (!records.length) {
      setCounts(new Map());
      return;
    }
    const ctrl = new AbortController();
    fetchObservationMediaCounts(records.map((record) => record.atUri), ctrl.signal)
      .then((nextCounts) => {
        if (!ctrl.signal.aborted) setCounts(nextCounts);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setCounts(new Map());
      });
    return () => ctrl.abort();
    // `refsKey` is the stable primitive dependency for the current record set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey]);

  return counts;
}

const ObservationCard = memo(function ObservationCard({
  record,
  mediaCount,
  measurements,
  onOpen,
  onFilterOwner,
  selection,
  compact = false,
}: {
  record: OccurrenceRecord;
  mediaCount: number;
  measurements: ObservationMeasurementFact[];
  onOpen: (record: ExplorerRecord) => void;
  onFilterOwner?: (did: string) => void;
  selection?: ObservationSelection;
  compact?: boolean;
}) {
  const t = useTranslations("marketplace.observationGrid");
  const measurementsT = useTranslations("marketplace.measurements");
  const ownerFilterT = useTranslations("marketplace.ownerFilter");
  const [imgError, setImgError] = useState(false);
  const [resolvedImageUrl, setResolvedImageUrl] = useState(record.imageUrl);
  const [profile, setProfile] = useState(() => getCachedProfile(record.did) ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unregisterAudioRef = useRef<(() => void) | null>(null);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing" | "paused">("idle");

  const imageUrl = resolvedImageUrl ?? record.imageUrl;
  const hasImage = Boolean(imageUrl) && !imgError;
  const hasAudio = Boolean(record.audioRef || record.audioUrl);
  const name = occurrenceDisplayName(record, t);
  const subtitle = occurrenceSecondaryName(record, t);
  const place = occurrencePlace(record);
  const creatorLabel = record.creatorName ?? profile?.displayName ?? profile?.handle ?? null;
  const date = record.eventDate || record.createdAt;
  const audioOnly = hasAudio && !hasImage;
  const selected = selection?.selectedIds.has(record.id) ?? false;
  const disabledReason = selection?.getDisabledReason?.(record) ?? null;
  const selectionDisabled = Boolean(disabledReason);

  useEffect(() => {
    setImgError(false);
    setResolvedImageUrl(record.imageUrl);
    if (record.imageUrl || !record.imageRef) return;

    const controller = new AbortController();
    resolveBlobUrl(record.did, record.imageRef, controller.signal)
      .then((url) => setResolvedImageUrl(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolvedImageUrl(null);
      });
    return () => controller.abort();
  }, [record.did, record.imageRef, record.imageUrl]);

  useEffect(() => {
    if (record.creatorName || profile) return;
    let active = true;
    resolveDidProfile(record.did).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [profile, record.creatorName, record.did]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      unregisterAudioRef.current?.();
      audioRef.current = null;
      unregisterAudioRef.current = null;
    },
    [],
  );

  async function toggleAudio(e: ReactMouseEvent) {
    e.stopPropagation();
    let el = audioRef.current;
    if (!el) {
      pauseOtherAudio();
      setAudioState("loading");
      const url = record.audioUrl ?? (await resolveBlobUrl(record.did, record.audioRef));
      if (!url) {
        setAudioState("idle");
        return;
      }
      el = new Audio(url);
      el.addEventListener("ended", () => setAudioState("paused"));
      el.addEventListener("pause", () => setAudioState("paused"));
      el.addEventListener("play", () => setAudioState("playing"));
      unregisterAudioRef.current?.();
      unregisterAudioRef.current = registerAudioElement(el);
      audioRef.current = el;
    }
    if (el.paused) {
      playExclusiveAudio(el).catch(() => setAudioState("paused"));
    } else {
      el.pause();
    }
  }

  function open() {
    if (hasAudio) pauseOtherAudio();
    onOpen(record);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-label={t("openDetails", { name })}
      className="group relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-surface-sunken text-left outline-none transition-all duration-300 hover:z-10 hover:shadow-[0_18px_40px_-22px_rgba(20,30,15,0.55)] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {hasImage ? (
        <Image
          src={imageUrl!}
          alt={name}
          fill
          sizes={compact ? "(max-width:640px) 33vw, (max-width:1024px) 16vw, 120px" : "(max-width:640px) 50vw, (max-width:1280px) 25vw, 240px"}
          unoptimized={!isPdsBlobUrl(imageUrl)}
          onError={() => setImgError(true)}
          className="scale-[1.05] object-cover transition-transform duration-[600ms] ease-out group-hover:scale-110"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: audioOnly
              ? "radial-gradient(125% 110% at 50% 18%, color-mix(in srgb, var(--primary) 60%, #0b2015), #081a10)"
              : "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent), var(--surface)",
          }}
        >
          {audioOnly ? (
            <AudioLinesIcon
              aria-hidden
              className="absolute left-1/2 top-[38%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 text-white/10"
            />
          ) : null}
        </div>
      )}

      {selection ? (
        <button
          type="button"
          disabled={selectionDisabled}
          title={disabledReason ?? undefined}
          aria-label={selected ? t("deselectObservation") : t("selectObservation")}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            if (!selectionDisabled) selection.onToggle(record, !selected);
          }}
          className={`absolute left-2 top-2 z-30 grid h-8 w-8 cursor-pointer place-items-center rounded-full border shadow-md backdrop-blur-md transition ${
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/55 bg-black/45 text-white hover:bg-black/60"
          } disabled:cursor-not-allowed disabled:opacity-55`}
        >
          {selected ? <CheckIcon className="h-4 w-4" aria-hidden /> : null}
        </button>
      ) : null}

      {!compact && mediaCount > 1 ? (
        <span
          className="absolute right-2 top-2 z-20 inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-full bg-black/58 px-2 text-[12px] font-semibold text-white shadow-md ring-1 ring-white/25 backdrop-blur-md"
          aria-label={t("mediaCount", { count: mediaCount })}
          title={t("mediaCount", { count: mediaCount })}
        >
          <Layers3Icon className="h-3.5 w-3.5" aria-hidden />
          {mediaCount}
        </span>
      ) : null}

      {hasAudio ? (
        <button
          type="button"
          onClick={toggleAudio}
          aria-label={audioState === "playing" ? t("pauseSound") : t("playSound")}
          className={
            hasImage
              ? "absolute left-2 top-12 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white shadow-md ring-1 ring-white/25 backdrop-blur-md transition hover:bg-black/70"
              : "absolute left-1/2 top-[38%] z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b2015] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)] transition hover:scale-105"
          }
        >
          {audioState === "loading" ? (
            <Loader2Icon className="h-5 w-5 animate-spin" aria-hidden />
          ) : audioState === "playing" ? (
            <PauseIcon className="h-5 w-5" aria-hidden />
          ) : (
            <PlayIcon className="h-5 w-5 translate-x-[1px]" aria-hidden />
          )}
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      <div className={cn("absolute inset-x-0 bottom-0 z-10", compact ? "p-1.5" : "p-2.5")}>
        {!compact && creatorLabel ? (
          onFilterOwner && record.did ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFilterOwner(record.did);
              }}
              aria-label={ownerFilterT("filterByThis")}
              title={ownerFilterT("filterByThis")}
              className="block max-w-full cursor-pointer truncate text-left text-[10.5px] font-medium uppercase tracking-[0.06em] text-white/85 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {creatorLabel}
            </button>
          ) : (
            <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-white/85">
              {creatorLabel}
            </p>
          )
        ) : null}
        <h3
          className={cn(
            "font-instrument leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]",
            compact ? "text-[12px] font-medium italic" : "text-[16px] italic",
          )}
          style={clamp(compact ? 1 : 2)}
        >
          {name}
        </h3>

        {!compact && place ? (
          <p className="mt-0.5 truncate text-[11.5px] leading-snug text-white/80">{place}</p>
        ) : null}

        {!compact && measurements.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {measurements.slice(0, 2).map((fact, index) => (
              <span
                key={`${fact.key ?? fact.label ?? "m"}-${index}`}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm"
              >
                <RulerIcon className="h-2.5 w-2.5 shrink-0" aria-hidden />
                <span className="truncate">{`${measurementFactLabel(fact, measurementsT)} ${fact.value}`.trim()}</span>
              </span>
            ))}
            {measurements.length > 2 ? (
              <span className="inline-flex items-center rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                {`+${measurements.length - 2}`}
              </span>
            ) : null}
          </div>
        ) : null}

        {!compact && (subtitle || date) ? (
          <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-out group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-visible:grid-rows-[1fr] group-focus-visible:opacity-100">
            <div className="overflow-hidden">
              {subtitle ? (
                <p className="mt-0.5 truncate text-[12px] italic leading-snug text-white/78">{subtitle}</p>
              ) : null}
              {date ? (
                <p className="mt-0.5 text-[10.5px] text-white/65">{formatDate(date)}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

const clamp = (n: number) =>
  ({
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: n,
    overflow: "hidden",
  }) as const;

function occurrenceDisplayName(record: OccurrenceRecord, t: ReturnType<typeof useTranslations<"marketplace.observationGrid">>): string {
  if (record.media.includes("audio") && record.vernacularName === "Nature sound recording") {
    return record.scientificName || t("natureSoundRecording");
  }
  return record.vernacularName || record.scientificName || (record.media.includes("audio") ? t("natureSoundRecording") : t("unidentifiedSighting"));
}

function occurrenceSecondaryName(record: OccurrenceRecord, t: ReturnType<typeof useTranslations<"marketplace.observationGrid">>): string | null {
  if (record.media.includes("audio") && record.vernacularName === "Nature sound recording") return t("natureSoundRecording");
  if (record.vernacularName && record.scientificName && record.vernacularName !== record.scientificName) return record.scientificName;
  return record.family ?? record.genus ?? null;
}

function occurrencePlace(record: OccurrenceRecord): string | null {
  return [record.locality, record.country].filter(Boolean).join(", ") || null;
}

function measurementFactLabel(
  fact: ObservationMeasurementFact,
  t: ReturnType<typeof useTranslations<"marketplace.measurements">>,
): string {
  if (fact.key) return t(`fields.${fact.key}`);
  return fact.label ?? "";
}
