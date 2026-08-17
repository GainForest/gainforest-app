"use client";

/**
 * Shared audio-recordings player list: the rows used on deployment detail
 * pages and the account Audio tab. Each row plays the recording's PDS
 * preview blob through one shared audio element; the spectrogram strip is
 * the seek surface, and the archival original (accessUri) is downloadable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AudioLinesIcon, DownloadIcon, Loader2Icon, PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { pdsBlobUrl, type AcAudioListItem } from "@/app/_lib/ac-audio";

const PAGE_SIZE = 20;

/**
 * The list is capped to this many rows tall; a day can hold hundreds of
 * clips, so beyond this the rows scroll inside a fixed viewport instead of
 * stretching the page and pushing the calendar and hour bars out of view.
 */
const MAX_VISIBLE_ROWS = 5;
/** Matches the `gap-1.5` (0.375rem) between rows. */
const ROW_GAP_PX = 6;
/** A row's height before it's measured, so the initial cap doesn't jump. */
const ESTIMATED_ROW_PX = 108;
/** Sliver of the next row left peeking under the cut, hinting it scrolls. */
const ROW_PEEK_PX = 18;

/** Pixel height that shows exactly MAX_VISIBLE_ROWS rows, plus a peek. */
function rowsCapPx(rowPx: number): number {
  return rowPx * MAX_VISIBLE_ROWS + ROW_GAP_PX * (MAX_VISIBLE_ROWS - 1) + ROW_PEEK_PX;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RecordingsPlayerList({
  did,
  host,
  items,
  selectable = false,
  selectedUris,
  onToggleSelect,
}: {
  did: string;
  host: string | null;
  items: AcAudioListItem[];
  /**
   * Drive-style selection: when true, clicking anywhere on a row (outside
   * the play/seek/download controls) toggles its selection; a checkbox
   * appears on hover and stays visible while selected. Shift-clicks are
   * forwarded so the parent can select whole ranges.
   */
  selectable?: boolean;
  selectedUris?: ReadonlySet<string>;
  onToggleSelect?: (item: AcAudioListItem, shiftKey?: boolean) => void;
}) {
  const t = useTranslations("common.audiomoth.recordings");

  const [visible, setVisible] = useState(PAGE_SIZE);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* Cap the list to MAX_VISIBLE_ROWS rows and scroll the rest. The row height
     is measured so the cap stays exact if the card layout ever changes. */
  const listRef = useRef<HTMLUListElement | null>(null);
  const [maxHeight, setMaxHeight] = useState(() => rowsCapPx(ESTIMATED_ROW_PX));

  /* Single shared audio element */
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => setTrackDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => setPlayingUri(null);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audioRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(
    (item: AcAudioListItem) => {
      const audio = audioRef.current;
      if (!audio || !host || !item.previewCid) return;
      if (playingUri === item.uri) {
        audio.pause();
        setPlayingUri(null);
        return;
      }
      setPosition(0);
      setTrackDuration(0);
      setBuffering(true);
      audio.src = pdsBlobUrl(host, did, item.previewCid);
      void audio.play().catch(() => setBuffering(false));
      setPlayingUri(item.uri);
    },
    [did, host, playingUri],
  );

  const seek = useCallback(
    (item: AcAudioListItem, fraction: number) => {
      const audio = audioRef.current;
      if (!audio || playingUri !== item.uri || trackDuration <= 0) return;
      audio.currentTime = Math.max(0, Math.min(trackDuration, fraction * trackDuration));
    },
    [playingUri, trackDuration],
  );

  const shown = useMemo(() => items.slice(0, visible), [items, visible]);

  /* Measure a real row once it's on screen so the cap matches its height. */
  useEffect(() => {
    const first = listRef.current?.firstElementChild as HTMLElement | null;
    if (!first) return;
    const measure = () => setMaxHeight(rowsCapPx(first.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(first);
    return () => observer.disconnect();
  }, [shown.length]);

  return (
    <>
      <ul ref={listRef} className="flex flex-col gap-1.5 overflow-y-auto pr-1" style={{ maxHeight }}>
        {shown.map((item) => {
          const playing = playingUri === item.uri;
          const progress = playing && trackDuration > 0 ? position / trackDuration : 0;
          const selected = selectable && (selectedUris?.has(item.uri) ?? false);
          return (
            <li
              key={item.uri}
              onClick={selectable ? (e) => onToggleSelect?.(item, e.shiftKey) : undefined}
              aria-selected={selectable ? selected : undefined}
              className={cn(
                "group rounded-xl border px-3 py-2.5 transition-colors",
                selectable && "cursor-pointer select-none",
                selected
                  ? "border-primary/50 bg-primary/[0.07]"
                  : playing
                    ? "border-primary/40 bg-primary/[0.04]"
                    : selectable
                      ? "border-border/70 hover:bg-muted/50"
                      : "border-border/70",
              )}
            >
              <div className="flex items-center gap-3">
                {selectable ? (
                  <Checkbox
                    checked={selected}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect?.(item, e.shiftKey);
                    }}
                    aria-label={t("selectAria", { name: item.name })}
                    className={cn(
                      "shrink-0 transition-opacity",
                      selected ? "opacity-100" : "opacity-40 sm:opacity-0 sm:group-hover:opacity-100",
                    )}
                  />
                ) : null}
                <Button
                  variant={playing ? "default" : "outline"}
                  size="icon-sm"
                  className="shrink-0 rounded-full"
                  disabled={!item.previewCid || !host}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay(item);
                  }}
                  aria-label={playing ? t("pauseAria", { name: item.name }) : t("playAria", { name: item.name })}
                  title={!item.previewCid ? t("previewUnavailable") : undefined}
                >
                  {playing && buffering ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : playing ? (
                    <PauseIcon className="size-4" />
                  ) : (
                    <PlayIcon className="size-4" />
                  )}
                </Button>

                <div className="min-w-0 flex-1">
                  {/* Spectrogram strip doubles as the seek bar while playing */}
                  {item.spectrogramCid && host ? (
                    <div
                      className="relative h-12 cursor-pointer overflow-hidden rounded-md bg-[#000004]"
                      onClick={(e) => {
                        // Seek only while this row is playing; otherwise let the
                        // click bubble up and toggle the row's selection.
                        if (playing) {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          seek(item, (e.clientX - rect.left) / rect.width);
                        }
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary PDS hosts */}
                      <img
                        src={pdsBlobUrl(host, did, item.spectrogramCid)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover object-left"
                      />
                      {playing ? (
                        <span
                          className="absolute inset-y-0 w-px bg-white shadow-[0_0_4px_rgba(255,255,255,0.9)]"
                          style={{ left: `${progress * 100}%` }}
                        />
                      ) : null}
                    </div>
                  ) : playing ? (
                    <div
                      className="h-1.5 cursor-pointer overflow-hidden rounded-full bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        seek(item, (e.clientX - rect.left) / rect.width);
                      }}
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
                    </div>
                  ) : null}

                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="truncate font-mono text-xs text-foreground">{item.name}</span>
                    {playing ? (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatClock(position)} / {formatClock(trackDuration)}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      item.recordedAt ? new Date(item.recordedAt).toLocaleString() : null,
                      item.durationSeconds !== null ? formatClock(item.durationSeconds) : null,
                      item.sampleRate !== null ? `${Math.round(item.sampleRate / 1000)} kHz` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {item.accessUri ? (
                  <a
                    href={item.accessUri}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t("downloadAria", { name: item.name })}
                  >
                    <DownloadIcon className="size-4" />
                  </a>
                ) : (
                  <span className="shrink-0 p-1.5 text-muted-foreground/30">
                    <AudioLinesIcon className="size-4" />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > visible ? (
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          {t("showMore", { count: items.length - visible })}
        </Button>
      ) : null}
    </>
  );
}
