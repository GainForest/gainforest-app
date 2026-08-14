"use client";

/**
 * Soundscape clock built from the acting account's already-uploaded
 * recordings — the signed-in user's own, or the organization they have
 * switched into with the header's account switcher. Reads list that repo and
 * every write (stored analyses, folder renames, deletions, published
 * soundscapes) targets the same repo.
 *
 * The library is the account's `ac.audio` records, grouped by the folder
 * each recording was uploaded into (its `deploymentRef` — every folder is an
 * `ac.deployment` record, whether it came from a chime-matched deployment or
 * was simply named at upload time). A soundscape describes one place and one
 * recorder schedule, so the clock is always built per folder — never across
 * the whole account. Each recording's
 * archival original (accessUri) is downloaded into the browser once, run
 * through the PMN pipeline, and the five per-band maxima are cached locally
 * by record CID — so returning to this tab redraws the clock without
 * re-downloading.
 */

import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FileAudioIcon,
  FolderOpenIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderKanbanIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Share2Icon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
  Volume2Icon,
  WavesIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { listAllRecordings, type AcAudioListItem } from "@/app/_lib/ac-audio";
import { countIdentificationsOn, deleteRecordings } from "@/app/_lib/ac-audio-delete";
import {
  applyAcDeploymentEdit,
  deleteAcDeployment,
  listAcDeployments,
  updateAcDeployment,
  type AcDeploymentItem,
} from "@/app/_lib/ac-deployment";
import { DeleteFolderModal, RenameFolderModal } from "@/app/_components/RecordingFolderModals";
import { listStoredAnalyses, saveStoredAnalysis } from "@/app/_lib/soundscape-analysis";
import { buildAnalysisRecord, isUsableAnalysis } from "@/lib/soundscape/analysis-record";
import {
  openWav,
  wallClockDateKey,
  wallClockFromIso,
  wallClockMinuteOfDay,
  type WallClockTime,
} from "@/lib/soundscape/audiomoth";
import {
  buildSoundscapePoints,
  chooseSlotMinutes,
  formatBandRange,
  snapToSlot,
  FREQUENCY_BANDS,
  nyquistHz,
} from "@/lib/soundscape/analysis";
import { computeRecordingPmn, MIN_SEGMENT_SECONDS, RecordingTooShortError } from "@/lib/soundscape/pmn";
import {
  formatWindowMinute,
  FULL_DAY_WINDOW,
  isFullDay,
  isInWindow,
  panWindow,
  windowEnd,
  windowFraction,
  zoomWindow,
  type TimeWindow,
} from "@/lib/soundscape/zoom";
import { loadPmnCache, savePmnCache, toCacheEntry, type PmnCache } from "@/lib/soundscape/pmn-cache";
import type { SoundscapeSource } from "@/lib/soundscape/record";
import { useModal } from "@/components/ui/modal/context";
import {
  AddSoundscapeToProjectModal,
  ShareSoundscapeToFeedModal,
  useShareTarget,
  useSoundscapePublisher,
  type SoundscapePublishInput,
} from "./ShareSoundscape";
import { isOutstanding, isRetryable, type AnalysisState, type AnalysisStatus } from "@/lib/soundscape/queue";
import { cn } from "@/lib/utils";
import { BAND_COLORS, SoundscapeClock } from "./SoundscapeClock";

/** One uploaded recording with everything the clock needs precomputed. */
type LibraryRecording = {
  item: AcAudioListItem;
  time: WallClockTime | null;
  /** Analyzable = has an archival original AND a usable recording time. */
  analyzable: boolean;
};

const ALL_DATES = "all";

/** Stamped faintly over the dial of a downloaded soundscape, so the picture
 *  still says where it came from if its edges are trimmed. */
const SOUNDSCAPE_WATERMARK_SRC = "/decor/gainforest-logo.svg";

/** Group id for recordings that carry no `deploymentRef` (uploaded before
 *  folders existed — today's uploader always puts recordings in a folder). */
const UNASSIGNED_GROUP = "unassigned";

/** One folder's worth of recordings — the unit a soundscape is built from. */
type RecordingGroup = {
  /** The folder's `ac.deployment` AT-URI, or {@link UNASSIGNED_GROUP}. */
  id: string;
  name: string;
  count: number;
};

/** One notch of the zoom buttons on the dial. */
const ZOOM_STEP = 1.6;

type AnalyzedLibraryRecording = LibraryRecording & { time: WallClockTime; pmn: number[] };

type PlayerState = {
  uri: string;
  minuteOfDay: number;
  name: string;
  status: "loading" | "playing";
};

/**
 * Browsers cap AudioBuffer sample rates well below AudioMoth's ultrasonic
 * modes (up to 384 kHz), so recordings above this rate are decimated with a
 * boxcar average before playback. Ultrasound isn't audible anyway — this only
 * affects the preview player, never the analysis.
 */
const MAX_PLAYBACK_SAMPLE_RATE = 96_000;
const DECIMATION_TARGET_RATE = 48_000;

function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatWallClock(time: WallClockTime): string {
  return `${wallClockDateKey(time)} ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

/** `07:04:30` — seconds included, because the point of the zoom view is to
 *  tell recordings a minute (or less) apart from each other. */
function formatClockTime(time: WallClockTime): string {
  return [time.hour, time.minute, time.second].map((part) => String(part).padStart(2, "0")).join(":");
}

export function SoundscapeClient({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.soundscape");
  const tFolders = useTranslations("common.recordingFolders");
  const [recordings, setRecordings] = useState<AcAudioListItem[] | null>(null);
  const [deployments, setDeployments] = useState<AcDeploymentItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [results, setResults] = useState<Record<string, AnalysisState>>({});
  const [selectedDate, setSelectedDate] = useState<string>(ALL_DATES);
  const [zoom, setZoom] = useState<TimeWindow>(FULL_DAY_WINDOW);
  const [visibleBands, setVisibleBands] = useState<boolean[]>(FREQUENCY_BANDS.map(() => true));
  const [paused, setPaused] = useState(false);
  const processingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<PmnCache | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playTokenRef = useRef(0);

  /* The account this library belongs to: the signed-in user's own repo, or
     the organization's when they have switched into one. `shareTarget.repo`
     is the group DID in that case (undefined when acting personally), and
     doubles as the write target for every mutation below. */
  const shareTarget = useShareTarget(sessionDid);
  const libraryDid = sessionDid ? (shareTarget.repo ?? sessionDid) : null;

  const allRecordings = useMemo<LibraryRecording[]>(() => {
    return (recordings ?? []).map((item) => {
      const time = wallClockFromIso(item.recordedAt);
      return { item, time, analyzable: Boolean(item.accessUri) && time !== null };
    });
  }, [recordings]);

  /* One group per folder that has recordings (newest first, the order
     listAcDeployments returns), then folders whose record was since deleted,
     then recordings never put in a folder. */
  const groups = useMemo<RecordingGroup[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of allRecordings) {
      const id = entry.item.deploymentRef ?? UNASSIGNED_GROUP;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const known = new Set(deployments.map((d) => d.uri));
    const result: RecordingGroup[] = [];
    for (const deployment of deployments) {
      const count = counts.get(deployment.uri);
      if (count) result.push({ id: deployment.uri, name: deployment.name, count });
    }
    for (const [id, count] of counts) {
      if (id === UNASSIGNED_GROUP || known.has(id)) continue;
      result.push({ id, name: t("groups.unknown"), count });
    }
    const unassigned = counts.get(UNASSIGNED_GROUP);
    if (unassigned) result.push({ id: UNASSIGNED_GROUP, name: t("groups.unassigned"), count: unassigned });
    return result;
  }, [allRecordings, deployments, t]);

  /* Derived, not synced: falls back to the first (newest) folder until the
     user picks one, so the dial never flashes empty while state catches up. */
  const selectedGroup = useMemo(() => {
    if (selectedGroupId && groups.some((group) => group.id === selectedGroupId)) return selectedGroupId;
    return groups[0]?.id ?? null;
  }, [groups, selectedGroupId]);

  const selectedGroupName = groups.find((group) => group.id === selectedGroup)?.name ?? "";

  /** The selected folder's own record — absent for the two synthetic groups
   *  (a folder whose record was removed, recordings that never had one), which
   *  is exactly when renaming and deleting can't be offered. */
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.uri === selectedGroup) ?? null,
    [deployments, selectedGroup],
  );

  /** The recordings a soundscape can be built from: the selected folder's. */
  const library = useMemo<LibraryRecording[]>(
    () => allRecordings.filter((entry) => (entry.item.deploymentRef ?? UNASSIGNED_GROUP) === selectedGroup),
    [allRecordings, selectedGroup],
  );

  /* Switching folder is starting a new soundscape: pending queue items
     from the old one are let go (anything already analyzed stays cached), and
     the date filter and zoom go back to their defaults. A download already in
     flight is left to finish so its result still lands in the cache. */
  const selectGroup = useCallback((id: string | null) => {
    setSelectedGroupId(id);
    setSelectedDate(ALL_DATES);
    setZoom(FULL_DAY_WINDOW);
    setPaused(false);
    setResults((current) => {
      let changed = false;
      const next: Record<string, AnalysisState> = { ...current };
      for (const key of Object.keys(next)) {
        if (next[key]?.status === "queued") {
          next[key] = { status: "idle" };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  /* Switching accounts mid-visit is a different library: drop the folder
     selection (and its date filter and zoom) carried over from the previous
     account, exactly as if a new folder had been picked. */
  const libraryDidRef = useRef(libraryDid);
  useEffect(() => {
    if (libraryDidRef.current === libraryDid) return;
    libraryDidRef.current = libraryDid;
    selectGroup(null);
  }, [libraryDid, selectGroup]);

  /* Load the acting account's uploaded recordings and seed results from the
     cache. */
  useEffect(() => {
    if (!libraryDid) return;
    let cancelled = false;
    const controller = new AbortController();
    setRecordings(null);
    setLoadFailed(false);
    setPaused(false);
    (async () => {
      try {
        /* The stored analyses are what make this survive a new browser, so
           they are fetched alongside the library rather than after it. A repo
           that has never been analyzed simply yields none. */
        const [items, stored, deploymentItems] = await Promise.all([
          listAllRecordings(libraryDid, controller.signal),
          listStoredAnalyses(libraryDid, controller.signal).catch(() => new Map()),
          // Folder names are presentation only — recordings still group by
          // their deploymentRef when this fails.
          listAcDeployments(libraryDid, controller.signal).catch(() => [] as AcDeploymentItem[]),
        ]);
        if (cancelled) return;
        const cache = cacheRef.current ?? loadPmnCache();
        cacheRef.current = cache;
        const seeded: Record<string, AnalysisState> = {};
        let cacheGrew = false;
        for (const item of items) {
          const analysis = stored.get(item.rkey);
          if (!cache[item.cid] && analysis && isUsableAnalysis(analysis, item.cid)) {
            // Warm the local cache from the account's own copy, so the next
            // visit doesn't even need the network.
            cache[item.cid] = toCacheEntry(analysis.bands, analysis.spectrum, analysis.sampleRate);
            cacheGrew = true;
          }
          const cached = cache[item.cid];
          seeded[item.uri] = cached ? { status: "done", pmn: cached.bands } : { status: "idle" };
        }
        if (cacheGrew) savePmnCache(cache);
        setResults(seeded);
        setDeployments(deploymentItems);
        setRecordings(items);
      } catch {
        if (!cancelled) {
          setRecordings([]);
          setLoadFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [libraryDid, reloadCounter]);

  /* Sequential analysis queue: download + analyze one recording at a time;
     each settled state update re-triggers this effect for the next one.
     While paused nothing new is dequeued, so resuming just picks up here. */
  useEffect(() => {
    if (paused || processingRef.current) return;
    const next = library.find((entry) => entry.analyzable && results[entry.item.uri]?.status === "queued");
    if (!next) return;
    processingRef.current = true;
    const { uri, cid, rkey, accessUri } = next.item;
    const controller = new AbortController();
    abortRef.current = controller;
    setResults((current) => ({ ...current, [uri]: { status: "downloading" } }));
    void (async () => {
      let update: AnalysisState;
      try {
        const response = await fetch(accessUri!, { signal: controller.signal });
        if (!response.ok) throw new Error("download_failed");
        const buffer = await response.arrayBuffer();
        setResults((current) => ({ ...current, [uri]: { status: "analyzing" } }));
        const wav = openWav(buffer);
        const { pmnPerBand, spectrum, sampleRate } = await computeRecordingPmn(wav);
        const cache = cacheRef.current ?? loadPmnCache();
        cacheRef.current = cache;
        cache[cid] = toCacheEntry(pmnPerBand, spectrum, sampleRate);
        savePmnCache(cache);
        /* Keep the result in the account, not just this browser. Best effort:
           the dial already has its numbers, and a failed write only costs the
           next visit a re-analysis, so it must never fail the recording. */
        void saveStoredAnalysis({
          rkey,
          record: buildAnalysisRecord({ audioUri: uri, audioCid: cid, sampleRate, bands: pmnPerBand, spectrum }),
          ...(shareTarget.repo ? { repo: shareTarget.repo } : {}),
        }).catch(() => {});
        update = { status: "done", pmn: pmnPerBand };
      } catch (error) {
        // Pausing aborts the in-flight download — that isn't a failure, the
        // recording simply goes back in line for when analysis resumes.
        update = controller.signal.aborted
          ? { status: "queued" }
          : {
              status: "error",
              errorKind:
                error instanceof RecordingTooShortError
                  ? "tooShort"
                  : // TypeError = fetch network/CORS failure (e.g. the storage bucket
                    // not allowing cross-origin GETs) — the bytes never arrived.
                    error instanceof TypeError || (error instanceof Error && error.message === "download_failed")
                    ? "download"
                    : "decode",
            };
      }
      abortRef.current = null;
      processingRef.current = false;
      setResults((current) => ({ ...current, [uri]: update }));
    })();
  }, [library, paused, results, shareTarget.repo]);

  /* Pause stops the queue at the current recording. The download is the long
     pole, so it is aborted outright; analysis that already started is cheap
     and finishes so its result still lands in the cache. */
  const pauseAnalysis = useCallback(() => {
    setPaused(true);
    abortRef.current?.abort();
  }, []);

  const resumeAnalysis = useCallback(() => setPaused(false), []);

  const startAnalysis = useCallback(() => {
    setPaused(false);
    setResults((current) => {
      const queued: Record<string, AnalysisState> = { ...current };
      for (const entry of library) {
        const state = queued[entry.item.uri];
        if (entry.analyzable && isRetryable(state)) {
          queued[entry.item.uri] = { status: "queued" };
        }
      }
      return queued;
    });
  }, [library]);

  const analyzableCount = library.filter((entry) => entry.analyzable).length;
  const remainingCount = library.filter(
    (entry) => entry.analyzable && isRetryable(results[entry.item.uri]),
  ).length;
  const doneCount = library.filter((entry) => results[entry.item.uri]?.status === "done").length;
  const active = library.find((entry) => {
    const status = results[entry.item.uri]?.status;
    return status === "downloading" || status === "analyzing";
  });
  /** Queued or in flight — the work a resume would carry on with. */
  const outstandingCount = library.filter((entry) => isOutstanding(results[entry.item.uri])).length;
  const busy = outstandingCount > 0;
  const running = busy && !paused;
  const settledCount = library.filter((entry) => {
    const status = results[entry.item.uri]?.status;
    return status === "done" || status === "error";
  }).length;

  const dateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of library) {
      if (entry.time && results[entry.item.uri]?.status === "done") keys.add(wallClockDateKey(entry.time));
    }
    return [...keys].sort();
  }, [library, results]);

  useEffect(() => {
    if (selectedDate !== ALL_DATES && !dateKeys.includes(selectedDate)) setSelectedDate(ALL_DATES);
  }, [dateKeys, selectedDate]);

  /** Analyzed recordings matching the date filter, earliest minute first. */
  const analyzedRecordings = useMemo<AnalyzedLibraryRecording[]>(() => {
    const analyzed = library
      .filter(
        (entry): entry is LibraryRecording & { time: WallClockTime } =>
          entry.time !== null &&
          results[entry.item.uri]?.status === "done" &&
          results[entry.item.uri]?.pmn !== undefined,
      )
      .map((entry) => ({ ...entry, pmn: results[entry.item.uri]!.pmn! }));
    const filtered =
      selectedDate === ALL_DATES
        ? analyzed
        : analyzed.filter((entry) => wallClockDateKey(entry.time) === selectedDate);
    return filtered.sort(
      (a, b) =>
        wallClockMinuteOfDay(a.time) - wallClockMinuteOfDay(b.time) ||
        wallClockDateKey(a.time).localeCompare(wallClockDateKey(b.time)),
    );
  }, [library, results, selectedDate]);

  /* How wide a slot on the dial has to be for these recordings to fold
     together — a minute for a scheduled deployment, wider when start times
     walk across the days (continuous recording). */
  const slotMinutes = useMemo(
    () =>
      chooseSlotMinutes(
        analyzedRecordings.map((entry) => wallClockMinuteOfDay(entry.time)),
        selectedDate === ALL_DATES ? dateKeys.length : 1,
      ),
    [analyzedRecordings, dateKeys.length, selectedDate],
  );

  const points = useMemo(
    () =>
      buildSoundscapePoints(
        analyzedRecordings.map((entry) => ({ minuteOfDay: wallClockMinuteOfDay(entry.time), pmn: entry.pmn })),
        { slotMinutes },
      ),
    [analyzedRecordings, slotMinutes],
  );

  // Which recording to play for each dial minute. The dial draws the average
  // of everything in a minute, so when several recordings share one (same
  // schedule slot across days) no single file is "the" one — play the loudest
  // and let the zoom list below reach the others.
  const playableByMinute = useMemo(() => {
    const loudness = (entry: AnalyzedLibraryRecording) => entry.pmn.reduce((sum, value) => sum + value, 0);
    const byMinute = new Map<number, AnalyzedLibraryRecording>();
    for (const entry of analyzedRecordings) {
      // Keyed by the slot the dial actually drew, so a click lands on a
      // recording even when the slot is wider than a minute.
      const minute = snapToSlot(wallClockMinuteOfDay(entry.time), slotMinutes);
      const existing = byMinute.get(minute);
      if (!existing || loudness(entry) > loudness(existing)) byMinute.set(minute, entry);
    }
    return byMinute;
  }, [analyzedRecordings, slotMinutes]);

  /** Every analyzed recording inside the zoom window — one row each, so two
   *  recordings a minute apart are still individually reachable. */
  const recordingsInView = useMemo(
    () =>
      analyzedRecordings
        .filter((entry) => isInWindow(wallClockMinuteOfDay(entry.time), zoom))
        .sort(
          (a, b) =>
            windowFraction(wallClockMinuteOfDay(a.time), zoom) -
              windowFraction(wallClockMinuteOfDay(b.time), zoom) ||
            wallClockDateKey(a.time).localeCompare(wallClockDateKey(b.time)),
        ),
    [analyzedRecordings, zoom],
  );

  /* A new date filter is a new day to explore — start from the whole dial. */
  useEffect(() => {
    setZoom(FULL_DAY_WINDOW);
  }, [selectedDate]);

  const stopPlayback = useCallback(() => {
    playTokenRef.current++;
    try {
      audioSourceRef.current?.stop();
    } catch {
      // Source may have already ended.
    }
    audioSourceRef.current = null;
    setPlayer(null);
  }, []);

  // Stop if the playing recording disappears (date filter / library refresh).
  const playableUris = useMemo(
    () => new Set(analyzedRecordings.map((entry) => entry.item.uri)),
    [analyzedRecordings],
  );
  useEffect(() => {
    if (player && !playableUris.has(player.uri)) stopPlayback();
  }, [playableUris, player, stopPlayback]);

  // Tear down audio on unmount.
  useEffect(() => {
    return () => {
      playTokenRef.current++;
      try {
        audioSourceRef.current?.stop();
      } catch {
        // Ignore.
      }
      void audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  /** Plays one specific recording (or stops it if it is the one playing). */
  const playRecording = useCallback(
    (entry: AnalyzedLibraryRecording) => {
      if (!entry.item.accessUri) return;
      if (player?.uri === entry.item.uri) {
        stopPlayback();
        return;
      }
      stopPlayback();
      setPlaybackFailed(false);
      const token = ++playTokenRef.current;
      const accessUri = entry.item.accessUri;
      const minuteOfDay = wallClockMinuteOfDay(entry.time);
      setPlayer({ uri: entry.item.uri, minuteOfDay, name: entry.item.name, status: "loading" });
      void (async () => {
        try {
          const response = await fetch(accessUri);
          if (!response.ok) throw new Error("download_failed");
          const buffer = await response.arrayBuffer();
          const wav = openWav(buffer);
          let samples = new Float32Array(wav.totalSamples);
          wav.readWindow(0, samples);
          let sampleRate = wav.sampleRate;
          if (sampleRate > MAX_PLAYBACK_SAMPLE_RATE) {
            const factor = Math.ceil(sampleRate / DECIMATION_TARGET_RATE);
            const length = Math.floor(samples.length / factor);
            const decimated = new Float32Array(length);
            for (let i = 0; i < length; i++) {
              let sum = 0;
              for (let j = 0; j < factor; j++) sum += samples[i * factor + j];
              decimated[i] = sum / factor;
            }
            samples = decimated;
            sampleRate = sampleRate / factor;
          }
          if (token !== playTokenRef.current) return;
          const context = (audioContextRef.current ??= new AudioContext());
          await context.resume();
          if (token !== playTokenRef.current) return;
          const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
          audioBuffer.getChannelData(0).set(samples);
          const source = context.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(context.destination);
          source.onended = () => {
            if (token === playTokenRef.current) {
              audioSourceRef.current = null;
              setPlayer(null);
            }
          };
          audioSourceRef.current = source;
          source.start();
          setPlayer((current) => (current?.uri === entry.item.uri ? { ...current, status: "playing" } : current));
        } catch {
          if (token === playTokenRef.current) {
            setPlayer(null);
            setPlaybackFailed(true);
          }
        }
      })();
    },
    [player, stopPlayback],
  );

  /* Across several days one dial minute holds one recording per day, so a
     click there could only ever play an arbitrary one of them. The dial is
     read-only in that mode; the zoom list below names the day of every
     recording and plays them individually. */
  const canPlayFromDial = selectedDate !== ALL_DATES;

  /* Clicking a time on the dial plays that minute's recording. */
  const handlePointClick = useCallback(
    (minuteOfDay: number) => {
      const entry = playableByMinute.get(minuteOfDay);
      if (entry) playRecording(entry);
    },
    [playableByMinute, playRecording],
  );

  /* The zoom buttons aim at what is playing, else at the loudest moment in
     view, so zooming in from the whole day lands on the recordings rather than
     on a blank hour in the middle of the dial. */
  const zoomBy = useCallback(
    (factor: number) => {
      setZoom((current) => {
        let focus = player && isInWindow(player.minuteOfDay, current) ? player.minuteOfDay : null;
        if (focus === null) {
          let loudest = -Infinity;
          for (const point of points) {
            if (!isInWindow(point.minuteOfDay, current)) continue;
            const sum = point.pmn.reduce((total, value, band) => total + (visibleBands[band] ? value : 0), 0);
            if (sum > loudest) {
              loudest = sum;
              focus = point.minuteOfDay;
            }
          }
        }
        return zoomWindow(current, factor, focus ?? undefined);
      });
    },
    [player, points, visibleBands],
  );

  /* How many recordings sit behind each point. Over a multi-week deployment
     coverage is rarely even — a battery dies, a card fills, a schedule changes
     — so the note reports the real spread rather than claiming every time of
     day is backed by the full run of days. */
  const averagedCounts = useMemo(() => {
    if (points.length === 0) return null;
    let min = Infinity;
    let max = 0;
    for (const point of points) {
      if (point.count < min) min = point.count;
      if (point.count > max) max = point.count;
    }
    return max > 1 ? { min, max } : null;
  }, [points]);

  const averageNote = averagedCounts
    ? averagedCounts.min === averagedCounts.max
      ? t("chart.averageNote", { count: averagedCounts.max })
      : t("chart.averageNoteRange", { min: averagedCounts.min, max: averagedCounts.max })
    : null;

  /* A few short lines: which folder this is, what the line is, then what the
     shading is. All go into the SVG so the downloaded image explains itself. */
  const chartSubtitle = useMemo(() => {
    const lines: string[] = [];
    if (groups.length > 1 && selectedGroupName) lines.push(selectedGroupName);
    if (averageNote) {
      lines.push(averageNote, t("chart.spreadNote"));
      if (slotMinutes > 1) lines.push(t("chart.slotNote", { minutes: slotMinutes }));
    }
    return lines.length > 0 ? lines : undefined;
  }, [averageNote, groups.length, selectedGroupName, slotMinutes, t]);

  const pointDetail = useCallback(
    (point: { count: number }) => (point.count > 1 ? t("chart.pointRecordings", { count: point.count }) : null),
    [t],
  );

  const chartDateLabel =
    selectedDate !== ALL_DATES
      ? selectedDate
      : dateKeys.length === 0
        ? ""
        : dateKeys.length === 1
          ? dateKeys[0]
          : `${dateKeys[0]} \u2013 ${dateKeys[dateKeys.length - 1]}`;

  /**
   * Top of the displayed spectrum: the highest frequency any of these
   * recordings can actually represent, so the open-ended top band never
   * advertises range the hardware never captured.
   */
  const ceilingHz = useMemo(() => {
    const rates = library.map((entry) => entry.item.sampleRate).filter((rate): rate is number => !!rate);
    return rates.length > 0 ? nyquistHz(Math.max(...rates)) : nyquistHz(48000);
  }, [library]);

  const bandRanges = useMemo(
    () => FREQUENCY_BANDS.map((band) => formatBandRange(band, ceilingHz)),
    [ceilingHz],
  );
  const bandLabels = useMemo(
    () => FREQUENCY_BANDS.map((band, index) => `${t(`bands.${band.labelKey}`)} \u00b7 ${bandRanges[index]}`),
    [bandRanges, t],
  );

  /* ── Sharing ────────────────────────────────────────────────────────────
     What is on the dial right now — the analyzed recordings of the selected
     day(s) — is what gets published. Zoom and hidden bands are ways of
     reading the same soundscape, so they deliberately don't change what is
     shared: a reader gets the whole thing and explores it themselves. */
  const modal = useModal();
  const publishSoundscape = useSoundscapePublisher(shareTarget);

  const shareInput = useMemo<SoundscapePublishInput | null>(() => {
    if (analyzedRecordings.length === 0) return null;
    const sources: SoundscapeSource[] = analyzedRecordings.map((entry) => ({
      audioUri: entry.item.uri,
      name: entry.item.name,
      date: wallClockDateKey(entry.time),
      minuteOfDay: wallClockMinuteOfDay(entry.time),
      pmn: entry.pmn,
    }));
    return {
      title:
        selectedGroup !== UNASSIGNED_GROUP && selectedGroupName
          ? t("share.recordTitleNamed", { name: selectedGroupName, dates: chartDateLabel })
          : t("share.recordTitle", { dates: chartDateLabel }),
      ceilingHz,
      sources,
    };
  }, [analyzedRecordings, ceilingHz, chartDateLabel, selectedGroup, selectedGroupName, t]);

  const closeShareModal = useCallback(() => {
    void modal.hide().then(() => modal.clear());
  }, [modal]);

  const openShareToFeed = useCallback(() => {
    if (!shareInput) return;
    modal.pushModal(
      {
        id: "soundscape-share-feed",
        dialogWidth: "max-w-lg w-[calc(100%-2rem)]",
        content: (
          <ShareSoundscapeToFeedModal
            input={shareInput}
            target={shareTarget}
            publish={publishSoundscape}
            onClose={closeShareModal}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [closeShareModal, modal, publishSoundscape, shareInput, shareTarget]);

  const openAddToProject = useCallback(() => {
    if (!shareInput) return;
    modal.pushModal(
      {
        id: "soundscape-add-to-project",
        dialogWidth: "max-w-lg w-[calc(100%-2rem)]",
        content: (
          <AddSoundscapeToProjectModal
            input={shareInput}
            target={shareTarget}
            publish={publishSoundscape}
            onClose={closeShareModal}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [closeShareModal, modal, publishSoundscape, shareInput, shareTarget]);

  /* ── Managing the selected folder ───────────────────────────────────────
     A folder is named in a hurry while an SD card uploads, so fixing its name
     later is the common case; deleting it (with the recordings filed in it)
     is the rare one. Both write the folder's own `ac.deployment` record, so
     neither is offered for the synthetic groups. */
  const renameFolder = useCallback(() => {
    const folder = selectedDeployment;
    if (!folder) return;
    modal.pushModal(
      {
        id: "soundscape-rename-folder",
        content: (
          <RenameFolderModal
            currentName={folder.name}
            onSave={async (name) => {
              const { cid } = await updateAcDeployment(
                folder,
                { name },
                shareTarget.repo ? { repo: shareTarget.repo } : undefined,
              );
              const updated = applyAcDeploymentEdit(folder, { name }, cid);
              setDeployments((current) =>
                current.map((item) => (item.uri === updated.uri ? updated : item)),
              );
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [modal, selectedDeployment, shareTarget.repo]);

  const deleteFolder = useCallback(() => {
    const folder = selectedDeployment;
    if (!folder) return;
    const inFolder = allRecordings
      .filter((entry) => entry.item.deploymentRef === folder.uri)
      .map((entry) => entry.item);
    const survivors = allRecordings
      .filter((entry) => entry.item.deploymentRef !== folder.uri)
      .map((entry) => entry.item);
    /* Nothing may be mid-download while its record is being deleted. */
    pauseAnalysis();
    modal.pushModal(
      {
        id: "soundscape-delete-folder",
        content: (
          <DeleteFolderModal
            name={folder.name}
            count={inFolder.length}
            countIdentifications={() => countIdentificationsOn(inFolder)}
            onConfirm={async (onProgress) => {
              const { deleted, failed } = await deleteRecordings({
                items: inFolder,
                survivors,
                ...(shareTarget.repo ? { repo: shareTarget.repo } : {}),
                onProgress,
              });
              if (deleted.size > 0) {
                setRecordings((current) => current?.filter((item) => !deleted.has(item.uri)) ?? current);
              }
              /* The folder record only goes once it is empty: removing it while
                 recordings still point at it would strand them in the group
                 the picker labels "Removed folder". */
              if (failed.size > 0) throw new Error(tFolders("deletePartial", { count: failed.size }));
              await deleteAcDeployment(folder, shareTarget.repo ? { repo: shareTarget.repo } : undefined);
              setDeployments((current) => current.filter((item) => item.uri !== folder.uri));
              selectGroup(null);
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [allRecordings, modal, pauseAnalysis, selectGroup, selectedDeployment, shareTarget.repo, tFolders]);

  const downloadPng = useCallback(async () => {
    const svg = chartRef.current?.querySelector<SVGSVGElement>("svg[data-soundscape-clock]");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", "1440");
    clone.setAttribute("height", "1440");
    // Inline theme colors so the exported image doesn't depend on CSS variables.
    clone.style.color = "#64748b";
    clone.querySelectorAll(".fill-muted-foreground").forEach((node) => node.setAttribute("fill", "#64748b"));
    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("SVG rasterization failed"));
        image.src = url;
      });
      /* The image should still name its source after it has travelled into a
         report or a slide deck, including if somebody trims its edges. So the
         credit is carried twice, both inside the picture: once faintly across
         the dial, where it cannot be cropped away without taking the chart
         with it, and once as a readable line at the foot of the canvas. */
      const canvas = document.createElement("canvas");
      canvas.width = 1440;
      canvas.height = 1440;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, 1440, 1440);

      context.textAlign = "center";
      context.textBaseline = "middle";

      /* Best effort: a logo that will not load must not cost the download. */
      const mark = new Image();
      const markLoaded = await new Promise<boolean>((resolve) => {
        mark.onload = () => resolve(true);
        mark.onerror = () => resolve(false);
        mark.src = SOUNDSCAPE_WATERMARK_SRC;
      });
      if (markLoaded) {
        /* The dial's empty centre: clean background, so the mark stays legible,
           and nothing can trim it off without cutting the chart in half. The
           centre comes from the SVG's own viewBox, so it stays right if the
           chart's layout ever changes; the size matches the centre hole
           (INNER_RADIUS 34 of 760 view units ≈ 0.089 of the width). */
        const vb = svg.viewBox.baseVal;
        const scale = canvas.width / vb.width;
        const cx = (vb.x + vb.width / 2) * scale;
        const cy = (vb.y + vb.height / 2) * scale;
        const size = Math.round(canvas.width * 0.089);
        context.save();
        context.globalAlpha = 0.45;
        context.drawImage(mark, cx - size / 2, cy - size / 2, size, size);
        context.restore();
      }

      /* Bottom right, clear of the chart's own centred time-axis label. */
      context.textAlign = "right";
      context.fillStyle = "#64748b";
      context.font = "500 24px ui-sans-serif, system-ui, sans-serif";
      context.fillText(t("chart.credit"), canvas.width - 28, 1416);
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = `soundscape-${chartDateLabel || "clock"}.png`;
      anchor.click();
    } catch {
      // Best effort — the on-screen chart is unaffected.
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [chartDateLabel, t]);

  if (!sessionDid) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <WavesIcon className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-medium text-foreground">{t("library.signInTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("library.signInBody")}</p>
      </div>
    );
  }

  if (recordings === null) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/70 px-6 py-16 text-sm text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin text-primary" />
        {t("library.loading")}
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <FileAudioIcon className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-medium text-foreground">{t("library.emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {loadFailed ? t("library.loadFailed") : t("library.emptyBody")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/observations/audio?tab=upload">
              <UploadIcon className="size-4" />
              {t("library.goToUpload")}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setReloadCounter((value) => value + 1)}>
            <RefreshCwIcon className="size-4" />
            {t("library.refresh")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Folder picker: a soundscape is built per folder (ac.deployment),
          never from the whole account at once. */}
      {groups.length > 1 || selectedDeployment ? (
        <section className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <FolderOpenIcon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("groups.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {groups.length > 1 ? t("groups.hint") : t("groups.hintSingle")}
                </p>
              </div>
            </div>
            {/* Renaming and deleting act on the selected folder, so they sit
                with the picker rather than on every chip. */}
            {selectedDeployment ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={renameFolder}>
                  <PencilIcon className="size-4" />
                  {tFolders("renameAction")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={deleteFolder}
                >
                  <Trash2Icon className="size-4" />
                  {tFolders("deleteAction")}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t("groups.title")}>
            {groups.map((group) => (
              <DateChip key={group.id} active={group.id === selectedGroup} onClick={() => selectGroup(group.id)}>
                {t("groups.chip", { name: group.name, count: group.count })}
              </DateChip>
            ))}
          </div>
        </section>
      ) : null}

      {/* Library of the selected folder's recordings */}
      <section className="rounded-2xl border bg-background shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <WavesIcon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("library.count", { count: library.length })}</p>
              <p className="truncate text-xs text-muted-foreground">{t("library.downloadNote")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                {active
                  ? results[active.item.uri]?.status === "downloading"
                    ? t("library.downloading", { name: active.item.name })
                    : t("library.analyzing", { name: active.item.name })
                  : t("library.progress", { done: doneCount, total: analyzableCount })}
              </span>
            ) : paused && busy ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <PauseIcon className="size-3.5" />
                {t("library.statusPaused", { done: doneCount, total: analyzableCount })}
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={active !== undefined}
              onClick={() => setReloadCounter((value) => value + 1)}
            >
              <RefreshCwIcon className="size-4" />
              {t("library.refresh")}
            </Button>
            {running ? (
              <Button type="button" size="sm" variant="outline" onClick={pauseAnalysis}>
                <PauseIcon className="size-4" />
                {t("library.pause")}
              </Button>
            ) : paused && busy ? (
              <Button type="button" size="sm" onClick={resumeAnalysis}>
                <PlayIcon className="size-4" />
                {t("library.resume", { count: outstandingCount })}
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={remainingCount === 0} onClick={startAnalysis}>
                <PlayIcon className="size-4" />
                {remainingCount > 0 ? t("library.analyze", { count: remainingCount }) : t("library.analyzeDone")}
              </Button>
            )}
          </div>
        </div>
        {busy ? (
          <div
            className="h-1 w-full overflow-hidden bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={analyzableCount}
            aria-valuenow={settledCount}
            aria-label={t("library.progress", { done: settledCount, total: analyzableCount })}
          >
            <div
              className={cn("h-full transition-[width]", paused ? "bg-muted-foreground/40" : "bg-primary")}
              style={{ width: `${(settledCount / Math.max(1, analyzableCount)) * 100}%` }}
            />
          </div>
        ) : null}
        <ul className="max-h-72 divide-y overflow-y-auto">
          {library.map((entry) => {
            const state = results[entry.item.uri] ?? { status: "idle" as const };
            return (
              <li key={entry.item.uri} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <StatusIcon status={state.status} analyzable={entry.analyzable} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{entry.item.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {entry.time ? (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="size-3" />
                        {formatWallClock(entry.time)}
                      </span>
                    ) : null}
                    {formatDuration(entry.item.durationSeconds) ? (
                      <span>{formatDuration(entry.item.durationSeconds)}</span>
                    ) : null}
                    <StatusLabel entry={entry} state={state} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Chart */}
      <section className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-medium text-foreground">
              {chartDateLabel ? t("chart.title", { date: chartDateLabel }) : t("chart.title", { date: t("chart.allDates") })}
            </h2>
            {averageNote ? <p className="mt-0.5 text-xs text-muted-foreground">{averageNote}</p> : null}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canPlayFromDial ? t("chart.hoverHint") : t("chart.hoverHintAllDates")}
            </p>
            {player ? (
              <p className="mt-1.5 flex items-center gap-2 text-xs text-primary">
                {player.status === "loading" ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <Volume2Icon className="size-3.5" />
                )}
                <span className="truncate">
                  {player.status === "loading"
                    ? t("chart.loadingAudio", { name: player.name })
                    : t("chart.playing", { name: player.name })}
                </span>
                <button
                  type="button"
                  onClick={stopPlayback}
                  className="flex items-center gap-1 rounded-md border border-primary/40 px-1.5 py-0.5 font-medium transition-colors hover:bg-primary/10"
                >
                  <SquareIcon className="size-2.5 fill-current" />
                  {t("chart.stop")}
                </button>
              </p>
            ) : playbackFailed ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangleIcon className="size-3.5" />
                {t("chart.playError")}
              </p>
            ) : null}
          </div>
          {points.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {shareInput ? (
                <>
                  <Button type="button" size="sm" onClick={openShareToFeed}>
                    <Share2Icon />
                    {t("share.shareToFeed")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={openAddToProject}>
                    <FolderKanbanIcon />
                    {t("share.addToProject")}
                  </Button>
                </>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => void downloadPng()}>
                <DownloadIcon />
                {t("chart.downloadPng")}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {dateKeys.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("chart.datesTitle")}>
              <DateChip active={selectedDate === ALL_DATES} onClick={() => setSelectedDate(ALL_DATES)}>
                {t("chart.allDatesChip")}
              </DateChip>
              {dateKeys.map((key) => (
                <DateChip key={key} active={selectedDate === key} onClick={() => setSelectedDate(key)}>
                  {key}
                </DateChip>
              ))}
            </div>
          ) : (
            <span />
          )}
          {points.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-sm tabular-nums text-muted-foreground">
                {isFullDay(zoom)
                  ? t("zoom.rangeAllDay")
                  : t("zoom.range", {
                      start: formatWindowMinute(zoom.start),
                      end: formatWindowMinute(windowEnd(zoom)),
                    })}
              </span>
              {!isFullDay(zoom) ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label={t("zoom.earlier")}
                    title={t("zoom.earlier")}
                    onClick={() => setZoom((current) => panWindow(current, -current.span / 2))}
                  >
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label={t("zoom.later")}
                    title={t("zoom.later")}
                    onClick={() => setZoom((current) => panWindow(current, current.span / 2))}
                  >
                    <ChevronRightIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label={t("zoom.zoomOut")}
                    title={t("zoom.zoomOut")}
                    onClick={() => zoomBy(ZOOM_STEP)}
                  >
                    <MinusIcon className="size-4" />
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("zoom.zoomIn")}
                title={t("zoom.zoomIn")}
                onClick={() => zoomBy(1 / ZOOM_STEP)}
              >
                <PlusIcon className="size-4" />
              </Button>
              {!isFullDay(zoom) ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setZoom(FULL_DAY_WINDOW)}>
                  <RotateCcwIcon className="size-4" />
                  {t("zoom.reset")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {points.length > 0 ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <div ref={chartRef} className="mx-auto w-full max-w-2xl">
                <SoundscapeClock
                  points={points}
                  visibleBands={visibleBands}
                  bandLabels={bandLabels}
                  title={t("chart.title", { date: chartDateLabel || t("chart.allDates") })}
                  subtitle={chartSubtitle}
                  pointDetail={pointDetail}
                  radialLabel={t("chart.radialLabel")}
                  timeLabel={t("chart.timeLabel")}
                  legendTitle={t("chart.legendTitle")}
                  onPointClick={canPlayFromDial ? handlePointClick : undefined}
                  onBackgroundClick={stopPlayback}
                  playingMinute={player?.minuteOfDay ?? null}
                  window={zoom}
                  onWindowChange={setZoom}
                  emptyLabel={t("zoom.empty")}
                />
              </div>

              {/* Zoomed in: every recording on show, individually playable */}
              {!isFullDay(zoom) ? (
              <div className="rounded-xl border bg-card/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
                  <p className="text-sm font-medium text-foreground">{t("zoom.recordingsTitle")}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {t("zoom.recordingsCount", { count: recordingsInView.length })}
                  </p>
                </div>
                {recordingsInView.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("zoom.recordingsEmpty")}</p>
                ) : (
                  <ul className="max-h-64 divide-y overflow-y-auto">
                    {recordingsInView.map((entry) => {
                      const isPlaying = player?.uri === entry.item.uri;
                      return (
                        <li key={entry.item.uri}>
                          <button
                            type="button"
                            onClick={() => playRecording(entry)}
                            aria-pressed={isPlaying}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                              isPlaying && "bg-primary/5",
                            )}
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">
                              {isPlaying ? (
                                player?.status === "loading" ? (
                                  <Loader2Icon className="size-3.5 animate-spin text-primary" />
                                ) : (
                                  <SquareIcon className="size-3 fill-current text-primary" />
                                )
                              ) : (
                                <PlayIcon className="size-3.5" />
                              )}
                            </span>
                            <span className="w-20 shrink-0 font-medium tabular-nums text-foreground">
                              {formatClockTime(entry.time)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {selectedDate === ALL_DATES ? `${wallClockDateKey(entry.time)} \u00b7 ` : ""}
                              {entry.item.name}
                            </span>
                            {formatDuration(entry.item.durationSeconds) ? (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {formatDuration(entry.item.durationSeconds)}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              ) : null}
            </div>
            <aside>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("chart.legendTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground/80">{t("chart.legendHint")}</p>
              <ul className="mt-2 space-y-1">
                {FREQUENCY_BANDS.map((band, index) => (
                  <li key={band.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleBands((current) => current.map((visible, i) => (i === index ? !visible : visible)))
                      }
                      aria-pressed={visibleBands[index]}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                        !visibleBands[index] && "opacity-40",
                      )}
                    >
                      <span
                        aria-hidden
                        className="mt-2 inline-block h-0.5 w-5 shrink-0 rounded-full"
                        style={{ backgroundColor: BAND_COLORS[index] }}
                      />
                      <span className="min-w-0">
                        <span className="block text-foreground">{t(`bands.${band.labelKey}`)}</span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {bandRanges[index]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {visibleBands.some((visible) => !visible) ? (
                <button
                  type="button"
                  onClick={() => setVisibleBands(FREQUENCY_BANDS.map(() => true))}
                  className="mt-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted"
                >
                  {t("chart.showAllBands")}
                </button>
              ) : null}
              <p className="mt-2 px-2 text-xs leading-5 text-muted-foreground">{t("chart.bandsNote")}</p>
            </aside>
          </div>
        ) : (
          <div className="mt-4 flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl bg-muted/30 p-8 text-center">
            <FileAudioIcon className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">{t("chart.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("chart.emptyHint")}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusIcon({ status, analyzable }: { status: AnalysisStatus; analyzable: boolean }) {
  if (!analyzable) return <AlertTriangleIcon className="size-4 shrink-0 text-muted-foreground/60" />;
  switch (status) {
    case "downloading":
    case "analyzing":
      return <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />;
    case "done":
      return <CheckIcon className="size-4 shrink-0 text-primary" />;
    case "error":
      return <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />;
    default:
      return <FileAudioIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function StatusLabel({ entry, state }: { entry: LibraryRecording; state: AnalysisState }) {
  const t = useTranslations("common.soundscape.library");
  if (!entry.analyzable) {
    return (
      <span>{entry.time === null ? t("statusNoTime") : t("statusNoOriginal")}</span>
    );
  }
  switch (state.status) {
    case "queued":
      return <span>{t("statusQueued")}</span>;
    case "done":
      return <span className="text-primary">{t("statusAnalyzed")}</span>;
    case "error":
      return (
        <span className="text-destructive">
          {state.errorKind === "tooShort" ? t("tooShort", { seconds: MIN_SEGMENT_SECONDS }) : t("statusError")}
        </span>
      );
    case "downloading":
    case "analyzing":
      return null;
    default:
      return <span>{t("statusNotAnalyzed")}</span>;
  }
}

function DateChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        props.active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {props.children}
    </button>
  );
}
