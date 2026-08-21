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
import { pauseOtherAudio, registerAudioElement } from "@/app/_lib/audio-coordinator";
import { Spectrogram } from "@/app/_components/Spectrogram";

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
  onPlay,
  activeUri,
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
  /** Called when a row starts playing, so a sibling player (e.g. a soundscape
   *  dial) can clear its own "now playing" state. */
  onPlay?: () => void;
  /** AT-URI of a recording playing through a sibling player (a soundscape
   *  dial). Its row is highlighted and scrolled into view so the listener can
   *  see the spectrogram of what they hear — without this list taking over
   *  the playback itself. */
  activeUri?: string | null;
}) {
  const t = useTranslations("common.audiomoth.recordings");

  const [visible, setVisible] = useState(PAGE_SIZE);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /* True while a pause we caused ourselves (stopping, or switching tracks) is
     in flight, so it isn't mistaken for another player taking over. */
  const selfPauseRef = useRef(false);
  /* A scrub can start a stopped track: remember where to jump so the seek can
     be applied once the freshly-loaded clip reports its duration. */
  const pendingSeekRef = useRef<number | null>(null);
  /* The PDS blob endpoint doesn't answer Range requests, so a streamed
     <audio> is unseekable (currentTime writes snap back to 0). We download the
     compact preview once into an in-memory object URL — a whole-file source is
     instantly seekable, which is what makes scrubbing actually stick. */
  const objectUrlRef = useRef<string | null>(null);
  /* Guards against rapid clicks: only the newest load may take over playback. */
  const loadTokenRef = useRef(0);

  /* Cap the list to MAX_VISIBLE_ROWS rows and scroll the rest. The row height
     is measured so the cap stays exact if the card layout ever changes. */
  const listRef = useRef<HTMLUListElement | null>(null);
  const [maxHeight, setMaxHeight] = useState(() => rowsCapPx(ESTIMATED_ROW_PX));

  /* Single shared audio element, registered with the page-wide coordinator so
     starting a row stops any other player (a soundscape dial, a feed clip) and
     vice versa — only one recording is ever audible at once. */
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setTrackDuration(duration);
      // A scrub that started this clip jumps to the pointed-at time as soon as
      // the duration is known.
      if (pendingSeekRef.current !== null && duration > 0) {
        const target = Math.max(0, Math.min(duration, pendingSeekRef.current * duration));
        audio.currentTime = target;
        setPosition(target);
      }
      pendingSeekRef.current = null;
    };
    const onEnded = () => setPlayingUri(null);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      selfPauseRef.current = false;
      setBuffering(false);
    };
    // A pause we didn't initiate means another player took over; drop this
    // row's playing state so it doesn't sit highlighted with no sound.
    const onPause = () => {
      if (selfPauseRef.current) return;
      setPlayingUri(null);
      setBuffering(false);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    const unregister = registerAudioElement(audio);
    return () => {
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      unregister();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      audioRef.current = null;
    };
  }, []);

  /* Load and play a recording, optionally jumping straight to a fraction of
     its length (a scrub landing on a stopped row). */
  const startPlaying = useCallback(
    (item: AcAudioListItem, atFraction: number) => {
      const audio = audioRef.current;
      if (!audio || !host || !item.previewCid) return;
      // Interrupting a track already playing here: flag that pause as ours.
      if (!audio.paused) {
        selfPauseRef.current = true;
        audio.pause();
      }
      setPosition(0);
      setTrackDuration(0);
      setBuffering(true);
      pendingSeekRef.current = atFraction > 0 ? atFraction : null;
      setPlayingUri(item.uri);
      onPlay?.();
      // Stop anything else playing on the page (a soundscape dial, a feed clip).
      pauseOtherAudio(audio);
      const token = ++loadTokenRef.current;
      const url = pdsBlobUrl(host, did, item.previewCid);
      // Download the whole preview, then play it from an object URL so the
      // recording is seekable (see objectUrlRef). onLoadedMetadata applies any
      // pending scrub target once the duration is known.
      void (async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error("preview_unavailable");
          const bytes = await response.arrayBuffer();
          if (token !== loadTokenRef.current) return; // a newer click won
          const type = response.headers.get("content-type")?.split(";")[0]?.trim() || "audio/wav";
          const objectUrl = URL.createObjectURL(new Blob([bytes], { type }));
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = objectUrl;
          audio.src = objectUrl;
          await audio.play();
        } catch {
          if (token !== loadTokenRef.current) return;
          setBuffering(false);
          setPlayingUri((current) => (current === item.uri ? null : current));
        }
      })();
    },
    [did, host, onPlay],
  );

  const togglePlay = useCallback(
    (item: AcAudioListItem) => {
      const audio = audioRef.current;
      if (!audio || !host || !item.previewCid) return;
      if (playingUri === item.uri) {
        selfPauseRef.current = true;
        audio.pause();
        setPlayingUri(null);
        return;
      }
      startPlaying(item, 0);
    },
    [host, playingUri, startPlaying],
  );

  /* Scrub the spectrogram: seek in place when this row is already playing,
     otherwise start it playing from the pointed-at moment. */
  const scrub = useCallback(
    (item: AcAudioListItem, fraction: number) => {
      const audio = audioRef.current;
      const clamped = Math.max(0, Math.min(1, fraction));
      if (audio && playingUri === item.uri && trackDuration > 0) {
        const target = clamped * trackDuration;
        audio.currentTime = target;
        setPosition(target);
        return;
      }
      startPlaying(item, clamped);
    },
    [playingUri, trackDuration, startPlaying],
  );

  const shown = useMemo(() => items.slice(0, visible), [items, visible]);

  /* A recording started elsewhere (the dial): reveal its row — page it in if
     it sits beyond the fold, then bring it into the scroll viewport. Done once
     per URI, so the reader can still scroll away while it keeps playing. */
  const revealedUriRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeUri) {
      revealedUriRef.current = null;
      return;
    }
    if (revealedUriRef.current === activeUri) return;
    const index = items.findIndex((item) => item.uri === activeUri);
    if (index < 0) return;
    if (index >= visible) {
      setVisible(Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
      return; // effect re-runs once the row exists
    }
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`li[data-uri="${CSS.escape(activeUri)}"]`);
    if (!list || !row) return;
    const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const rowHeight = row.offsetHeight;
    if (rowTop < list.scrollTop || rowTop + rowHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({
        top: Math.max(0, rowTop - (list.clientHeight - rowHeight) / 2),
        behavior: "smooth",
      });
    }
    revealedUriRef.current = activeUri;
  }, [activeUri, items, visible]);

  /* Measure a real row once it's on screen so the cap matches its height.
     Re-observed whenever the rows change — not just their count — because a
     changed list (zooming a soundscape swaps the items wholesale) unmounts
     the observed row, and a detached row measures 0. The zero-guard keeps
     that final observer tick from collapsing the list to nothing. */
  useEffect(() => {
    const first = listRef.current?.firstElementChild as HTMLElement | null;
    if (!first) return;
    const measure = () => {
      if (first.offsetHeight > 0) setMaxHeight(rowsCapPx(first.offsetHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(first);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <>
      <ul ref={listRef} className="flex flex-col gap-1.5 overflow-y-auto pe-1" style={{ maxHeight }}>
        {shown.map((item) => {
          const playing = playingUri === item.uri;
          const active = playing || activeUri === item.uri;
          const progress = playing && trackDuration > 0 ? position / trackDuration : 0;
          const selected = selectable && (selectedUris?.has(item.uri) ?? false);
          return (
            <li
              key={item.uri}
              data-uri={item.uri}
              onClick={selectable ? (e) => onToggleSelect?.(item, e.shiftKey) : undefined}
              aria-selected={selectable ? selected : undefined}
              className={cn(
                "group rounded-xl border px-3 py-2.5 transition-colors",
                selectable && "cursor-pointer select-none",
                selected
                  ? "border-primary/50 bg-primary/[0.07]"
                  : active
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
                  {/* Spectrogram strip doubles as the seek bar: clicking any
                      point jumps the recording there — starting it if stopped. */}
                  {item.spectrogramCid && host ? (
                    <Spectrogram
                      source={{ kind: "image", url: pdsBlobUrl(host, did, item.spectrogramCid) }}
                      imageClassName="object-cover object-left"
                      className="h-12 rounded-md bg-[#000004]"
                      playheadFraction={playing ? progress : null}
                      onSeek={(fraction) => scrub(item, fraction)}
                    />
                  ) : playing ? (
                    <div
                      className="h-1.5 cursor-pointer overflow-hidden rounded-full bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        scrub(item, (e.clientX - rect.left) / rect.width);
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
