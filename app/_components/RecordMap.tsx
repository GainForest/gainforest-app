"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DivIcon,
  Layer,
  LayerGroup,
  Map as LeafletMap,
  Marker,
  MarkerClusterGroup,
  MarkerCluster,
  TileLayer,
} from "leaflet";
import { useTranslations } from "next-intl";
import { mapTileUrl, resolvePointsFor, type MapPoint } from "../_lib/coords";
import type { ExplorerRecord, RecordKind } from "../_lib/indexer";
import { formatNumber, formatCompact, formatDate } from "../_lib/format";
import { accountHref, preferredDidIdentifier } from "../_lib/urls";
import { getCachedProfile } from "../_lib/did-profile";
import {
  hydrateRecordTip,
  recordCreatedTimestamp,
  recordTimestamp,
  recordTipHtml,
  type MapTipLabels,
} from "../_lib/map-tooltip";
import { MapTimeline, type DragMode } from "./MapTimeline";

// Map view for the record streams. Vanilla Leaflet (dynamically imported so it
// never touches `window` during SSR) + leaflet.markercluster on CARTO Positron
// tiles to match the cream palette. Records cluster into labelled sage bubbles
// so a dense survey site reads as one "412" pin instead of a confusing pile of
// overlapping dots; click a cluster to zoom in, and fully-coincident points
// spiderfy at max zoom. Clicking a single pin opens the loaded record's drawer,
// or links out to the org when the pin is not part of the loaded page.
//
// When the loaded records carry timestamps, a date-range timeline floats over
// the map: drag the two handles (or the band between them) to pick a window,
// then press play to watch the records reveal in the order they happened. The
// markers stay clustered — the cluster bubbles just recompute as the window /
// play head changes. Hovering a marker shows a rich preview card (photo, name,
// date, coordinates) instead of a plain label.

/** A point that carries a record + the moment it represents (for the timeline). */
type TimedPoint = { record: ExplorerRecord; point: MapPoint; t: number };
/** A point shown regardless of the timeline window (no usable timestamp). */
type StaticPoint = { record: ExplorerRecord | null; point: MapPoint };

/** How long a full-range play-through takes, in ms. Sub-windows scale down. */
const PLAY_MS = 14_000;
/** Shortest a play-through can take, so tiny windows don't blink past. */
const MIN_PLAY_MS = 2_800;
/** Don't re-fit the map more often than this while the timeline plays. */
const FIT_THROTTLE_MS = 850;
/** How many bars the density histogram behind the track is split into. */
const HISTO_BUCKETS = 64;
/** Minimum gap between the two handles, as a fraction of the axis. */
const MIN_GAP = 0.015;
/** Below this many datable records the timeline is hidden (nothing to scrub). */
const MIN_TIMELINE_POINTS = 2;
/** Playback speeds offered in the speed selector (YouTube-style). */
const PLAY_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3];
const DAY_MS = 86_400_000;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const perfNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Within a short total span the day-only label would make From and To identical,
// so show the time too (e.g. "Jun 26, 09:22"); otherwise just the date.
const dayTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** Label for the moment `t`, time-aware when the whole axis spans < ~2 days. */
function spanLabel(min: number, max: number, t: number): string {
  if (max - min < 2 * DAY_MS) return dayTimeFmt.format(new Date(t));
  return formatDate(new Date(t).toISOString());
}

/** Label for the date at fraction `frac` (0..1) across the [min,max] axis. */
function fracToLabel(min: number, max: number, frac: number): string {
  return spanLabel(min, max, min + (max - min) * frac);
}

// Accent colour for the uncertainty circles, read from the live CSS variable so
// it follows light/dark. Falls back to the brand green if unavailable (SSR).
function readPrimaryColor(): string {
  if (typeof window === "undefined") return "#2f6b3a";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return value || "#2f6b3a";
}

function clusterTier(n: number): { tier: string; size: number } {
  if (n < 10) return { tier: "sm", size: 36 };
  if (n < 100) return { tier: "md", size: 44 };
  if (n < 1000) return { tier: "lg", size: 52 };
  return { tier: "xl", size: 60 };
}

export function RecordMap({
  records,
  kind,
  onOpen,
  timeBounds,
}: {
  records: ExplorerRecord[];
  kind: RecordKind;
  onOpen: (r: ExplorerRecord) => void;
  /** Optional axis bounds for the floating timeline. BioBlitz uses this so the
   *  scrubber always represents the whole selected round, not only the days
   *  that already have uploads. */
  timeBounds?: { start: string; end: string };
}) {
  const t = useTranslations("marketplace.map");
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<MarkerClusterGroup | null>(null);
  // Uncertainty circles live in a plain (non-clustered) layer group beneath the
  // markers; timed circles are tracked by the same index as their marker so they
  // appear/disappear together as the timeline window moves.
  const circleLayerRef = useRef<LayerGroup | null>(null);
  const timedCirclesRef = useRef<Map<number, Layer>>(new Map());
  const accentRef = useRef<string>("#2f6b3a");
  const tileRef = useRef<TileLayer | null>(null);
  const pinIconRef = useRef<DivIcon | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [resolving, setResolving] = useState(true);
  // Auto-fit bookkeeping: `userMoved` disables auto-fit once the visitor pans
  // or zooms; `fitting` marks our own programmatic moves so they don't count
  // as user interaction. Both reset when a new data set loads.
  const userMovedRef = useRef(false);
  const fittingRef = useRef(false);

  // ── Timeline state (React) drives the scrubber render ──────────────────────
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [winStart, setWinStart] = useState(0);
  const [winEnd, setWinEnd] = useState(1);
  const [histo, setHisto] = useState<number[]>([]);
  const [bounds, setBounds] = useState<{ min: number; max: number } | null>(null);
  // Mirror the speed into a ref so the rAF loop picks up changes mid-playback
  // without restarting.
  const speedRef = useRef(1);
  speedRef.current = speed;

  // ── Timeline refs (drive the rAF loop without re-rendering) ────────────────
  const timedRef = useRef<TimedPoint[]>([]);
  const staticPointsRef = useRef<MapPoint[]>([]);
  const timedMarkersRef = useRef<Map<number, Marker>>(new Map());
  const shownFromRef = useRef(0);
  const shownToRef = useRef(0);
  const rangeRef = useRef<{ min: number; max: number }>({ min: 0, max: 1 });
  const winRef = useRef<{ start: number; end: number }>({ start: 0, end: 1 });
  const headRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastFitRef = useRef(0);

  // Live DOM the rAF loop / drag updates by ref (no React churn).
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadElRef = useRef<HTMLDivElement>(null);
  const headDateRef = useRef<HTMLSpanElement>(null);
  const headCountRef = useRef<HTMLSpanElement>(null);

  // Latest translated tooltip labels + open handler, read inside imperative
  // marker closures so we never rebuild markers just because they changed.
  const labelsRef = useRef<MapTipLabels>({ unidentified: t("unidentified") });
  labelsRef.current = { unidentified: t("unidentified") };
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  // Init the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      // Patches the imported L instance with markerClusterGroup().
      await import("leaflet.markercluster");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      pinIconRef.current = L.divIcon({
        className: "gf-pin",
        html: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const dark = document.documentElement.classList.contains("dark");
      const map = L.map(elRef.current, {
        worldCopyJump: true,
        minZoom: 1,
        zoomControl: false,
      }).setView([12, 5], 2);
      // Zoom control top-left: clear of the top-right count chip and the
      // timeline scrubber that floats along the bottom edge.
      L.control.zoom({ position: "topleft" }).addTo(map);
      tileRef.current = L.tileLayer(mapTileUrl(dark), {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      // Vector layer for the approximate-area circles. Leaflet renders vectors
      // in the overlay pane, below the marker pane, so circles sit under pins
      // automatically. Added before the cluster purely for readability.
      accentRef.current = readPrimaryColor();
      const circleLayer = L.layerGroup().addTo(map);
      circleLayerRef.current = circleLayer;
      const cluster = L.markerClusterGroup({
        // Coverage polygons add visual noise on the cream palette; the count
        // bubble + zoom-on-click already communicate density.
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        spiderfyDistanceMultiplier: 1.4,
        chunkedLoading: true,
        iconCreateFunction: (c: MarkerCluster) => {
          const n = c.getChildCount();
          const { tier, size } = clusterTier(n);
          return L.divIcon({
            html: `<div class="gf-cluster gf-cluster--${tier}">${formatCompact(n)}</div>`,
            className: "gf-cluster-wrap",
            iconSize: L.point(size, size),
          });
        },
      });
      cluster.addTo(map);
      layerRef.current = cluster;
      // Any move we didn't initiate is the visitor exploring; stop auto-fitting.
      map.on("movestart", () => {
        if (!fittingRef.current) userMovedRef.current = true;
      });
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      circleLayerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  // Track the app theme (the toggle flips `.dark` on <html>) and swap basemaps
  // so the map follows light/dark without a remount.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    tileRef.current?.setUrl(mapTileUrl(isDark));
    accentRef.current = readPrimaryColor();
  }, [isDark]);

  // Resolve points whenever the record set changes. A new data set re-enables
  // auto-fit so the map always frames the freshly loaded points.
  useEffect(() => {
    const controller = new AbortController();
    userMovedRef.current = false;
    setResolving(true);
    resolvePointsFor(records, kind, {
      signal: controller.signal,
      onProgress: (pts) => setPoints(pts),
    })
      .then((pts) => setPoints(pts))
      .catch(() => {})
      .finally(() => setResolving(false));
    return () => controller.abort();
  }, [records, kind]);

  // ── Imperative marker helpers (operate on refs, no React state) ────────────

  function makeMarker(record: ExplorerRecord | null, point: MapPoint): Marker | null {
    const L = LRef.current;
    const icon = pinIconRef.current;
    if (!L || !icon) return null;
    const marker = L.marker([point.lat, point.lon], { icon });
    if (record) {
      const tip = { lat: point.lat, lon: point.lon };
      marker.bindTooltip(recordTipHtml(record, tip, labelsRef.current), {
        direction: "top",
        offset: [0, -10],
        opacity: 1,
        className: "gf-occ-tip",
      });
      marker.on("tooltipopen", () => void hydrateRecordTip(marker, record, tip, labelsRef.current));
    } else if (point.label) {
      marker.bindTooltip(point.label, { direction: "top", offset: [0, -8] });
    }
    marker.on("click", () => {
      if (record) {
        onOpenRef.current(record);
      } else if (point.did) {
        window.open(
          accountHref(preferredDidIdentifier(point.did, getCachedProfile(point.did)?.handle)),
          "_blank",
          "noopener",
        );
      }
    });
    return marker;
  }

  /** Approximate-area circle for a point, or null when it has none. Only drawn
   *  for occurrences (whose `geojson` is a privacy/uncertainty circle); site &
   *  project boundaries keep their plain pins on the cluster map. The layer is
   *  non-interactive so it never steals a click from the marker on top of it. */
  function makeCircle(point: MapPoint): Layer | null {
    const L = LRef.current;
    if (!L || kind !== "occurrence" || !point.geojson) return null;
    const accent = accentRef.current;
    return L.geoJSON(point.geojson, {
      interactive: false,
      style: { color: accent, weight: 1, fillColor: accent, fillOpacity: 0.12 },
    });
  }

  /** Histogram of datable points per time bucket (track backdrop). */
  function buildHisto(pts: TimedPoint[], min: number, max: number): number[] {
    const buckets = new Array<number>(HISTO_BUCKETS).fill(0);
    const span = max - min || 1;
    for (const p of pts) {
      const idx = clamp(Math.floor(((p.t - min) / span) * HISTO_BUCKETS), 0, HISTO_BUCKETS - 1);
      buckets[idx] += 1;
    }
    return buckets;
  }

  /** Count of timed points at or before `t` (binary search; sorted asc). */
  function countAtTime(time: number): number {
    const pts = timedRef.current;
    let lo = 0;
    let hi = pts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid]!.t <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** First index whose point time is >= `t` (sorted asc). */
  function lowerBound(time: number): number {
    const pts = timedRef.current;
    let lo = 0;
    let hi = pts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid]!.t < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Show exactly the timed-index window [from, to), diffing against what's drawn
   *  so the cluster only adds/removes the markers that actually changed. */
  function setTimedRange(from: number, to: number) {
    const cluster = layerRef.current;
    const timed = timedRef.current;
    if (!cluster) return;
    const lo = clamp(from, 0, timed.length);
    const hi = clamp(to, lo, timed.length);
    const prevFrom = shownFromRef.current;
    const prevTo = shownToRef.current;
    if (lo === prevFrom && hi === prevTo) return;
    const markers = timedMarkersRef.current;
    const circles = timedCirclesRef.current;
    const circleLayer = circleLayerRef.current;
    const toRemove: Marker[] = [];
    const toAdd: Marker[] = [];
    for (let i = prevFrom; i < prevTo; i++) {
      if (i < lo || i >= hi) {
        const m = markers.get(i);
        if (m) {
          toRemove.push(m);
          markers.delete(i);
        }
        const c = circles.get(i);
        if (c) {
          circleLayer?.removeLayer(c);
          circles.delete(i);
        }
      }
    }
    for (let i = lo; i < hi; i++) {
      if (i < prevFrom || i >= prevTo) {
        const tp = timed[i]!;
        const m = makeMarker(tp.record, tp.point);
        if (m) {
          markers.set(i, m);
          toAdd.push(m);
        }
        const c = makeCircle(tp.point);
        if (c && circleLayer) {
          circles.set(i, c);
          circleLayer.addLayer(c);
        }
      }
    }
    if (toRemove.length) cluster.removeLayers(toRemove);
    if (toAdd.length) cluster.addLayers(toAdd);
    shownFromRef.current = lo;
    shownToRef.current = hi;
  }

  /** Frame a set of points, collapsing a near-coincident cluster to a fixed
   *  readable zoom instead of slamming Leaflet to street level. */
  function fitTo(pts: MapPoint[], animate: boolean) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !pts.length) return;
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lonSpan = Math.max(...lons) - Math.min(...lons);
    fittingRef.current = true;
    if (latSpan < 0.01 && lonSpan < 0.01) {
      const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const lon = (Math.min(...lons) + Math.max(...lons)) / 2;
      map.setView([lat, lon], 14, { animate });
    } else {
      const b = L.latLngBounds(pts.map((p) => [p.lat, p.lon] as [number, number]));
      map.fitBounds(b, { padding: [48, 48], maxZoom: 14, animate, duration: 0.7 });
    }
    setTimeout(() => {
      fittingRef.current = false;
    }, 0);
  }

  /** The points currently drawn (timed window + always-on static points). */
  function shownPoints(): MapPoint[] {
    const timed = timedRef.current;
    const out: MapPoint[] = [];
    for (let i = shownFromRef.current; i < shownToRef.current; i++) out.push(timed[i]!.point);
    for (const p of staticPointsRef.current) out.push(p);
    return out;
  }

  /** Push the play-head position into the live DOM without a React render. */
  function syncHeadUi(h: number) {
    const { min, max } = rangeRef.current;
    const headT = min + (max - min) * h;
    if (playheadElRef.current) playheadElRef.current.style.left = `${h * 100}%`;
    if (headDateRef.current) headDateRef.current.textContent = spanLabel(min, max, headT);
    if (headCountRef.current) {
      const shown = shownToRef.current - shownFromRef.current + staticPointsRef.current.length;
      headCountRef.current.textContent = t("shown", { count: formatNumber(shown) });
    }
  }

  /** Apply the play-head fraction `h`: reveal [windowStart, h], re-fit (throttled
   *  or forced) and update the live head line + readout. */
  function apply(h: number, forceFit = false) {
    const { min, max } = rangeRef.current;
    const { start, end } = winRef.current;
    const head = clamp(h, start, end);
    // A window starting at 0 also sweeps in any sparse pre-axis outliers.
    const startT = start <= 0.0001 ? -Infinity : min + (max - min) * start;
    const headT = min + (max - min) * head;
    const fromIdx = lowerBound(startT);
    const toIdx = Math.max(fromIdx, countAtTime(headT));
    setTimedRange(fromIdx, toIdx);
    const now = perfNow();
    if (forceFit || now - lastFitRef.current > FIT_THROTTLE_MS) {
      fitTo(shownPoints(), !forceFit);
      lastFitRef.current = now;
    }
    syncHeadUi(head);
  }

  function setWindow(start: number, end: number) {
    winRef.current = { start, end };
    setWinStart(start);
    setWinEnd(end);
  }

  function stopLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
  }

  // Rebuild markers + the timeline whenever the resolved points change.
  useEffect(() => {
    const cluster = layerRef.current;
    const map = mapRef.current;
    if (!cluster || !map || !ready) return;
    map.invalidateSize();
    stopLoop();
    cluster.clearLayers();
    circleLayerRef.current?.clearLayers();
    timedMarkersRef.current = new Map();
    timedCirclesRef.current = new Map();
    shownFromRef.current = 0;
    shownToRef.current = 0;

    // Partition into datable (timeline) points + always-on static points,
    // tracking both the observed date and the upload time per point.
    const raw: Array<{ record: ExplorerRecord; point: MapPoint; tEvent: number; tCreated: number }> = [];
    const staticPts: StaticPoint[] = [];
    for (const point of points) {
      const record = point.recordId ? recordById.get(point.recordId) ?? null : null;
      if (!record) {
        staticPts.push({ record: null, point });
        continue;
      }
      const tEvent = recordTimestamp(record);
      const tCreated = recordCreatedTimestamp(record);
      if (tEvent == null && tCreated == null) {
        staticPts.push({ record, point });
        continue;
      }
      raw.push({ record, point, tEvent: tEvent ?? tCreated!, tCreated: tCreated ?? tEvent! });
    }

    // Prefer the observed date, but if every point shares one eventDate (common
    // for a single bulk upload) fall back to the upload time so there is still a
    // spread to scrub through.
    const evMin = raw.length ? Math.min(...raw.map((r) => r.tEvent)) : 0;
    const evMax = raw.length ? Math.max(...raw.map((r) => r.tEvent)) : 0;
    const useCreated = evMax === evMin;
    const timed: TimedPoint[] = raw.map((r) => ({
      record: r.record,
      point: r.point,
      t: useCreated ? r.tCreated : r.tEvent,
    }));
    timed.sort((a, b) => a.t - b.t);

    const forcedMin = timeBounds ? Date.parse(timeBounds.start) : Number.NaN;
    const forcedMax = timeBounds ? Date.parse(timeBounds.end) : Number.NaN;
    const hasForcedBounds = Number.isFinite(forcedMin) && Number.isFinite(forcedMax) && forcedMax > forcedMin;
    const min = hasForcedBounds ? forcedMin : timed.length ? timed[0]!.t : 0;
    const max = hasForcedBounds ? forcedMax : timed.length ? timed[timed.length - 1]!.t : 0;
    const timelineEnabled = timed.length >= MIN_TIMELINE_POINTS && max > min;

    if (timelineEnabled) {
      timedRef.current = timed;
      rangeRef.current = { min, max };
      setBounds({ min, max });
      setHisto(buildHisto(timed, min, max));
    } else {
      // Nothing to scrub: every point is static (always visible).
      for (const tp of timed) staticPts.push({ record: tp.record, point: tp.point });
      timedRef.current = [];
      rangeRef.current = { min: 0, max: 1 };
      setBounds(null);
      setHisto([]);
    }
    staticPointsRef.current = staticPts.map((s) => s.point);

    // Static markers go in once and stay for the life of this data set; their
    // approximate-area circles ride along in the dedicated vector layer.
    const staticMarkers: Marker[] = [];
    for (const s of staticPts) {
      const m = makeMarker(s.record, s.point);
      if (m) staticMarkers.push(m);
    }
    if (staticMarkers.length) cluster.addLayers(staticMarkers);
    const circleLayer = circleLayerRef.current;
    if (circleLayer) {
      for (const s of staticPts) {
        const c = makeCircle(s.point);
        if (c) circleLayer.addLayer(c);
      }
    }

    // Reset the window to "everything", play-head parked at the end.
    winRef.current = { start: 0, end: 1 };
    headRef.current = 1;
    setWinStart(0);
    setWinEnd(1);
    setPlaying(false);
    if (timelineEnabled) setTimedRange(0, timed.length);

    // Initial framing of the whole data set (unless the visitor already panned).
    if (points.length > 0 && !userMovedRef.current) fitTo(points, false);
    if (timelineEnabled) syncHeadUi(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, recordById, ready, timeBounds]);

  // ── Play / pause ───────────────────────────────────────────────────────────
  function play() {
    if (!timedRef.current.length) return;
    const { start, end } = winRef.current;
    // Restart from the window's start if we're parked at (or near) its end.
    if (headRef.current >= end - 0.0005) {
      headRef.current = start;
      apply(start, true);
    }
    setPlaying(true);
    lastTsRef.current = null;
    const width = Math.max(end - start, 0.0001);
    // Base duration at 1×; the live speed ref scales each frame's advance so the
    // selector can speed up / slow down playback on the fly.
    const baseDuration = Math.max(MIN_PLAY_MS, PLAY_MS * width);
    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      headRef.current = Math.min(end, headRef.current + (width * dt * speedRef.current) / baseDuration);
      apply(headRef.current);
      if (headRef.current >= end) {
        stopLoop();
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function pause() {
    stopLoop();
    setPlaying(false);
  }

  function togglePlay() {
    if (playing) pause();
    else play();
  }

  // ── Dragging the handles / band ─────────────────────────────────────────────
  function beginDrag(mode: DragMode) {
    return (e: React.PointerEvent) => {
      if (!bounds) return;
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      pause();
      const rect = track.getBoundingClientRect();
      const startX = e.clientX;
      const s0 = winRef.current.start;
      const e0 = winRef.current.end;
      const w0 = e0 - s0;

      const onMove = (ev: PointerEvent) => {
        const frac = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        let ns = s0;
        let ne = e0;
        if (mode === "start") ns = clamp(frac, 0, e0 - MIN_GAP);
        else if (mode === "end") ne = clamp(frac, s0 + MIN_GAP, 1);
        else {
          const d = (ev.clientX - startX) / rect.width;
          ns = clamp(s0 + d, 0, 1 - w0);
          ne = ns + w0;
        }
        setWindow(ns, ne);
        // Park the play-head at the window's end so the map shows the whole
        // selected slice while you drag.
        headRef.current = ne;
        apply(ne);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        apply(headRef.current, true);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  /** Jump the play-head by clicking the track (outside a handle / the band). */
  function onTrackClick(e: React.MouseEvent) {
    if (!bounds) return;
    if ((e.target as HTMLElement).closest(".gf-tl-handle, .gf-tl-band")) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const frac = clamp(
      (e.clientX - rect.left) / rect.width,
      winRef.current.start,
      winRef.current.end,
    );
    pause();
    headRef.current = frac;
    apply(frac, true);
  }

  const mappedNote =
    resolving && points.length === 0
      ? t("finding")
      : kind === "site"
        ? t("mappedSites", { count: formatNumber(points.length) })
        : t("mappedItems", { count: formatNumber(points.length) });

  const maxBucket = histo.length ? Math.max(...histo) : 1;
  const startLabel = bounds ? fracToLabel(bounds.min, bounds.max, winStart) : "—";
  const endLabel = bounds ? fracToLabel(bounds.min, bounds.max, winEnd) : "—";

  return (
    <div className="relative">
      <div
        ref={elRef}
        className="h-[68vh] min-h-[440px] w-full overflow-hidden rounded-2xl border border-border-soft bg-surface-sunken"
        style={{ zIndex: 0 }}
      />
      <div className="pointer-events-none absolute right-3 top-3 z-[5] inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-[12.5px] font-medium text-foreground/70 shadow-sm backdrop-blur">
        <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
        {mappedNote}
      </div>
      {bounds ? (
        <MapTimeline
          disabled={false}
          playing={playing}
          onTogglePlay={togglePlay}
          histo={histo}
          maxBucket={maxBucket}
          winStart={winStart}
          winEnd={winEnd}
          startLabel={startLabel}
          endLabel={endLabel}
          axisStartLabel={fracToLabel(bounds.min, bounds.max, 0)}
          axisEndLabel={fracToLabel(bounds.min, bounds.max, 1)}
          defaultHeadCount={t("shown", { count: formatNumber(points.length) })}
          startAria={t("startAria", { date: startLabel })}
          endAria={t("endAria", { date: endLabel })}
          speed={speed}
          speedOptions={PLAY_SPEEDS}
          onSpeedChange={setSpeed}
          beginDrag={beginDrag}
          onTrackClick={onTrackClick}
          trackRef={trackRef}
          playheadElRef={playheadElRef}
          headDateRef={headDateRef}
          headCountRef={headCountRef}
          labels={{
            play: t("play"),
            pause: t("pause"),
            from: t("from"),
            to: t("to"),
            dragHint: t("dragHint"),
            speed: t("speed"),
          }}
        />
      ) : null}
      {kind !== "occurrence" && !resolving && points.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[5] flex justify-center">
          <span className="rounded-full bg-background/90 px-3 py-1.5 text-[12.5px] text-foreground/60 shadow-sm backdrop-blur">
            {t("noLocations")}
          </span>
        </div>
      )}
    </div>
  );
}
