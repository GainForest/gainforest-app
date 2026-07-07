"use client";

/**
 * Recordings section on a deployment detail page: the `ac.audio` records
 * linked (via the companion `ac.deployment`) to this chime deployment event,
 * with an inline player for the PDS preview blob, the spectrogram strip as
 * the seek surface, and a download link to the archival original.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  AudioLinesIcon,
  DownloadIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolvePdsHost } from "@/app/_lib/pds";
import { listAcDeployments } from "@/app/_lib/ac-deployment";
import {
  listRecordingsForDeployment,
  pdsBlobUrl,
  type AcAudioListItem,
} from "@/app/_lib/ac-audio";

const PAGE_SIZE = 20;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DeploymentRecordings({
  did,
  eventUri,
  isOwner,
}: {
  did: string;
  eventUri: string;
  isOwner: boolean;
}) {
  const t = useTranslations("common.audiomoth.recordings");

  const [items, setItems] = useState<AcAudioListItem[] | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const [pdsHost, deployments] = await Promise.all([
          resolvePdsHost(did, ctrl.signal),
          listAcDeployments(did, ctrl.signal),
        ]);
        if (ctrl.signal.aborted) return;
        setHost(pdsHost);
        const deployment = deployments.find((d) => d.eventRef === eventUri) ?? null;
        if (!deployment) {
          setItems([]);
          return;
        }
        const recordings = await listRecordingsForDeployment(did, deployment.uri, ctrl.signal);
        if (!ctrl.signal.aborted) setItems(recordings);
      } catch {
        if (!ctrl.signal.aborted) {
          setItems([]);
          setLoadError(true);
        }
      }
    })();
    return () => ctrl.abort();
  }, [did, eventUri]);

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

  const shown = useMemo(() => (items ?? []).slice(0, visible), [items, visible]);

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t("title")}
          {items && items.length > 0 ? (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] normal-case tracking-normal text-primary">
              {items.length}
            </span>
          ) : null}
        </p>
        {isOwner ? (
          <Link
            href="/audiomoth?tab=upload"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            <UploadIcon className="h-3.5 w-3.5" aria-hidden />
            {t("uploadCta")}
          </Link>
        ) : null}
      </div>

      {items === null ? (
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : loadError ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("loadError")}</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-1.5">
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
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              {t("showMore", { count: items.length - visible })}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
