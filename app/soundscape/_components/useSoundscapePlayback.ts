"use client";

/**
 * The one way a soundscape recording is played, shared by every surface that
 * offers a soundscape: the workbench where they are analyzed, the permalink
 * page, the feed card and the evidence timeline.
 *
 * A recording is addressed by its `ac.audio` AT-URI and resolved on demand —
 * a soundscape can point at hundreds of them and a listener only ever hears
 * the minute they tapped. Resolution prefers the compact preview blob stored
 * on the owner's PDS (small, CORS-open, playable by a plain <audio> element
 * anywhere) and falls back to the archival original. That preview-first path
 * is what makes playback work for a signed-out reader — and it is exactly what
 * the workbench was missing when it tried to decode the archival WAV itself.
 *
 * One <audio> element per surface, registered with the page-wide coordinator
 * so starting a recording here stops whatever else was playing.
 */

import { useCallback, useEffect, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import { resolvePlayableRecording } from "@/app/_lib/soundscape-record";
import { registerAudioElement, playExclusiveAudio } from "@/app/_lib/audio-coordinator";

export type SoundscapePlaybackStatus = "loading" | "playing" | "paused";

/** What is playing right now (or loading, or paused). */
export type SoundscapePlaybackState = {
  /** The `ac.audio` AT-URI of the recording. */
  audioUri: string;
  minuteOfDay: number;
  name: string;
  status: SoundscapePlaybackStatus;
};

/** A recording to play — the minimum any caller already has to hand. */
export type SoundscapePlaybackSource = {
  audioUri: string;
  minuteOfDay: number;
  name?: string | null;
};

/** Props for the single hidden <audio> element the surface must render. */
export type SoundscapeAudioProps = {
  ref: RefObject<HTMLAudioElement | null>;
  preload: "none";
  className: string;
  onEnded: () => void;
  onTimeUpdate: (event: SyntheticEvent<HTMLAudioElement>) => void;
};

export type SoundscapePlayback = {
  /** Spread onto exactly one `<audio>` in the component's tree. */
  audioProps: SoundscapeAudioProps;
  /** The recording that is playing, loading, or paused — else null. */
  player: SoundscapePlaybackState | null;
  /** True after a recording could not be resolved or played. */
  failed: boolean;
  /** 0–1 fraction of the current recording elapsed (for a progress bar). */
  progress: number;
  /** Start (or restart) this recording, replacing whatever was playing. */
  play: (source: SoundscapePlaybackSource) => void;
  /** Play this recording, or stop it if it is already the active one. */
  toggle: (source: SoundscapePlaybackSource) => void;
  /** Stop and clear playback. */
  stop: () => void;
  /** Pause the playing recording (keeps it as the active, paused one). */
  pause: () => void;
  /** Resume a paused recording. */
  resume: () => void;
};

export function useSoundscapePlayback(): SoundscapePlayback {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const [player, setPlayer] = useState<SoundscapePlaybackState | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);

  /* One shared <audio> element, registered with the page-wide coordinator so
     starting a recording here stops whatever else was playing. */
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    return registerAudioElement(element);
  }, []);

  const stop = useCallback(() => {
    playTokenRef.current++;
    const element = audioRef.current;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    setPlayer(null);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    (source: SoundscapePlaybackSource) => {
      stop();
      setFailed(false);
      const token = ++playTokenRef.current;
      setPlayer({
        audioUri: source.audioUri,
        minuteOfDay: source.minuteOfDay,
        name: source.name ?? "",
        status: "loading",
      });
      void (async () => {
        const playable = await resolvePlayableRecording(source.audioUri).catch(() => null);
        if (token !== playTokenRef.current) return;
        const element = audioRef.current;
        if (!playable || !element) {
          setPlayer(null);
          setFailed(true);
          return;
        }
        // Try each candidate URL in turn: the compact preview blob first, the
        // archival original as a fallback for recordings uploaded before
        // previews were generated.
        for (const url of playable.urls) {
          element.src = url;
          try {
            await playExclusiveAudio(element);
            if (token !== playTokenRef.current) return;
            setPlayer((current) =>
              current?.audioUri === source.audioUri ? { ...current, status: "playing" } : current,
            );
            return;
          } catch {
            if (token !== playTokenRef.current) return;
          }
        }
        setPlayer(null);
        setFailed(true);
      })();
    },
    [stop],
  );

  const toggle = useCallback(
    (source: SoundscapePlaybackSource) => {
      if (player?.audioUri === source.audioUri) {
        stop();
        return;
      }
      play(source);
    },
    [play, player, stop],
  );

  const pause = useCallback(() => {
    const element = audioRef.current;
    if (element && player?.status === "playing") {
      element.pause();
      setPlayer({ ...player, status: "paused" });
    }
  }, [player]);

  const resume = useCallback(() => {
    const element = audioRef.current;
    if (element && player?.status === "paused") {
      void playExclusiveAudio(element).catch(() => setFailed(true));
      setPlayer({ ...player, status: "playing" });
    }
  }, [player]);

  const audioProps: SoundscapeAudioProps = {
    ref: audioRef,
    preload: "none",
    className: "hidden",
    onEnded: () => {
      setPlayer(null);
      setProgress(0);
    },
    onTimeUpdate: (event) => {
      const element = event.currentTarget;
      setProgress(element.duration > 0 ? element.currentTime / element.duration : 0);
    },
  };

  return { audioProps, player, failed, progress, play, toggle, stop, pause, resume };
}
