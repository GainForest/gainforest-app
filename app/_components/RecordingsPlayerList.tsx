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
import { cn } from "@/lib/utils";
import { pdsBlobUrl, type AcAudioListItem } from "@/app/_lib/ac-audio";

const PAGE_SIZE = 20;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RecordingsPlayerList({
  did,
  host,
  items,
}: {
  did: string;
  host: string | null;
  items: AcAudioListItem[];
}) {
  const t = useTranslations("common.audiomoth.recordings");

  const [visible, setVisible] = useState(PAGE_SIZE);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {shown.map((item) => {
          const playing = playingUri === item.uri;
          const progress = playing && trackDuration > 0 ? position / trackDuration : 0;
          return (
            <li
              key={item.uri}
              className={cn(
                "rounded-xl border px-3 py-2.5 transition-colors",
                playing ? "border-primary/40 bg-primary/[0.04]" : "border-border/70",
              )}
            >
              <div className="flex items-center gap-3">
                <Button
                  variant={playing ? "default" : "outline"}
                  size="icon-sm"
                  className="shrink-0 rounded-full"
                  disabled={!item.previewCid || !host}
                  onClick={() => togglePlay(item)}
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
                        const rect = e.currentTarget.getBoundingClientRect();
                        seek(item, (e.clientX - rect.left) / rect.width);
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
