"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectPin } from "../_lib/projects";

/**
 * Live, draggable globe for the landing.
 *
 * Built on `react-globe.gl` (Vasco Asturiano's three.js wrapper around D3 +
 * topojson) so we don't need a Mapbox token and the canvas has a transparent
 * background — the page colour shows through outside the sphere, matching
 * the floating-globe look the design calls for.
 *
 * Project pins come from {@link fetchProjectPins}, which proxies
 * data.gainforest.app's `/api/list-organizations?info=true&mapPoint=true` route.
 * That route walks Hyperindex → each org's `defaultSite` → the certified
 * location GeoJSON blob on the PDS, computes a centroid with Turf, and
 * returns `{ did, info, mapPoint }`. We then filter exactly the way
 * green_globe's `useIndexedOrganizations` filters — keep only entries
 * with both `info` and `mapPoint` non-null — so we render the same set of
 * ATProto-sourced pins data.gainforest.app's deployed globe renders.
 *
 * Behaviour:
 *  - The globe auto-rotates until the user grabs it (mirrors green_globe's
 *    spinGlobe in `src/app/(map-routes)/_utils/map.ts`).
 *  - Each pin is a small green dot, and a sparse subset of pins emits a
 *    soft radar-style ping at staggered, randomised intervals. Subtle but
 *    enough to convey "this data is alive".
 */
const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
  loading: () => null,
});

/** OrbitControls.autoRotateSpeed is in arbitrary units (~roughly degrees/sec
 *  divided by ten — Mapbox uses ~3 deg/sec, this matches that pace). */
const AUTO_ROTATE_SPEED = 0.55;

/** Cap how many pins ping at once so the globe stays quiet. */
const MAX_PINGING_PINS = 14;

type GlobeProps = {
  pins: ProjectPin[];
  diameter: number;
  /**
   * Enable user-driven drag-to-rotate.
   *
   * Both modes share the same OrbitControls config under the hood
   * (zoom and pan are always disabled — the team preferred wheel
   * scrolling the page to wheel zooming the globe). The flag exists
   * so the consumer can decorate the canvas appropriately and so
   * later tweaks can branch on it. Used today only by the embedded
   * "What's Green Globe?" preview, which adds a grab cursor and a
   * "drag to spin" hint chip.
   */
  interactive?: boolean;
  /** Optional live spotlight pin. Rendered larger/warmer with its own ring. */
  highlightedDid?: string | null;
  /** Emits whether the highlighted pin is on the globe's front hemisphere. */
  onHighlightedVisibilityChange?: (visible: boolean) => void;
  /** Emits the visible front-hemisphere pin DIDs for synchronized spotlights. */
  onVisiblePinsChange?: (visibleDids: string[]) => void;
};

// Pseudo-random pin positions for the loading skeleton. Picked once so the
// skeleton looks like "a globe with project pins on it" without giving the
// impression that those specific dots map to real places.
const SKELETON_PINS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 35, y: 30 }, // North America
  { x: 48, y: 38 }, // Europe
  { x: 56, y: 56 }, // Africa
  { x: 38, y: 64 }, // South America
  { x: 70, y: 44 }, // South Asia
];

export function LiveGlobe({
  pins,
  diameter,
  interactive = false,
  highlightedDid = null,
  onHighlightedVisibilityChange,
  onVisiblePinsChange,
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The Globe instance ref — used to drive auto-rotate + controls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const lastHighlightedVisibleRef = useRef<boolean | null>(null);
  const lastVisibleDidsRef = useRef("");

  // Configure controls once the globe finishes initialising. Using the
  // library's `onGlobeReady` callback (rather than a fixed setTimeout)
  // guarantees `controls()` exists before we touch it — otherwise on a
  // slow first paint the enableZoom = false would silently miss.
  const handleReady = () => {
    setReady(true);
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls?.();
    if (!controls) return;

    controls.autoRotate = true;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    // Drag-to-rotate is OrbitControls' default and works in both
    // modes. The only thing that toggles per-mode is auto-rotate's
    // "stops on first grab" behaviour (always on). Zoom and pan are
    // hard-disabled in both modes — the team preferred a drag-only
    // interactive preview over wheel zoom (wheel zoom blocks page
    // scroll over the globe, which feels worse than the upside).
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minDistance = controls.maxDistance = controls.getDistance?.() ?? 0;

    const stopSpin = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener?.("start", stopSpin);
  };

  // Safety net: even with `enableZoom = false`, three.js still listens
  // for wheel events on the canvas and would block the page from
  // scrolling over the globe. Capturing the wheel event on the
  // container lets the page scroll like normal and stops any latent
  // zoom behaviour. Applies to both static and interactive (drag-only)
  // globes.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      // Let the page handle the scroll; don't let the globe consume it.
      e.stopPropagation();
    };
    node.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => {
      node.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, []);

  // The partners section only exposes the ATProto record link when the
  // corresponding highlighted dot is actually on the visible hemisphere.
  // react-globe.gl rotates the camera around a static sphere, so comparing
  // the pin vector with the camera vector gives a cheap front/back test.
  useEffect(() => {
    if (!onHighlightedVisibilityChange) return;
    // Force a fresh callback for each new highlighted record. Without this,
    // a visible → visible spotlight change would leave the parent reset to
    // hidden because the cached boolean never changed.
    lastHighlightedVisibleRef.current = null;
    const pin = pins.find((candidate) => candidate.did === highlightedDid);
    if (!ready || !pin) {
      if (lastHighlightedVisibleRef.current !== false) {
        lastHighlightedVisibleRef.current = false;
        onHighlightedVisibilityChange(false);
      }
      return;
    }

    let frame = 0;
    const tick = () => {
      const visible = isPinVisibleOnGlobe(
        globeRef.current as GlobeApi | null,
        pin,
      );
      if (visible !== null && visible !== lastHighlightedVisibleRef.current) {
        lastHighlightedVisibleRef.current = visible;
        onHighlightedVisibilityChange(visible);
      }
      frame = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedDid, onHighlightedVisibilityChange, pins, ready]);

  useEffect(() => {
    if (!onVisiblePinsChange) return;
    if (!ready) {
      if (lastVisibleDidsRef.current) {
        lastVisibleDidsRef.current = "";
        onVisiblePinsChange([]);
      }
      return;
    }

    const emitVisiblePins = () => {
      const api = globeRef.current as GlobeApi | null;
      const visibleDids = pins
        .filter((pin) => isPinVisibleOnGlobe(api, pin) === true)
        .map((pin) => pin.did);
      const key = visibleDids.join("|");
      if (key !== lastVisibleDidsRef.current) {
        lastVisibleDidsRef.current = key;
        onVisiblePinsChange(visibleDids);
      }
    };

    emitVisiblePins();
    const id = window.setInterval(emitVisiblePins, 650);
    return () => window.clearInterval(id);
  }, [onVisiblePinsChange, pins, ready]);

  // Memoise the points and ring datasets so the globe doesn't redraw on each
  // re-render. Pings stagger pseudo-randomly across pins for the "real data
  // is alive" effect — every pin gets its own ringRepeatPeriod and offset.
  const { points, rings } = useMemo(() => {
    const points = pins.map((pin) => ({
      ...pin,
      altitude: pin.did === highlightedDid ? 0.018 : 0.012,
      highlighted: pin.did === highlightedDid,
    }));

    // Pick a sparse subset of pins for ping rings — small enough to stay
    // calm but not so small that you wait forever to see one.
    const stride = Math.max(1, Math.ceil(pins.length / MAX_PINGING_PINS));
    const ringPins = pins.filter((_, i) => i % stride === 0);
    const rings = ringPins.map((pin, i) => ({
      ...pin,
      highlighted: false,
      // 4–9 second period, staggered so they fire at different beats.
      repeatPeriod: 4000 + ((i * 1303) % 5000),
    }));

    const highlightedPin = pins.find((pin) => pin.did === highlightedDid);
    if (highlightedPin) {
      rings.push({
        ...highlightedPin,
        highlighted: true,
        repeatPeriod: 1800,
      });
    }

    return { points, rings };
  }, [pins, highlightedDid]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ width: diameter, height: diameter }}
    >
      <Globe
        ref={globeRef}
        width={diameter}
        height={diameter}
        backgroundColor="rgba(0,0,0,0)"
        onGlobeReady={handleReady}
        // A subtle dark-green atmosphere reads better against the cream
        // background than the default cyan halo.
        showAtmosphere
        atmosphereColor="#2a4a31"
        atmosphereAltitude={0.18}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        // ── Static project dots ────────────────────────────────────────────
        pointsData={points}
        pointLat={(d: object) => (d as ProjectPin).lat}
        pointLng={(d: object) => (d as ProjectPin).lon}
        pointAltitude={(d: object) =>
          (d as ProjectPin & { altitude: number }).altitude
        }
        // Pin/ring sizes are in degrees of arc on the sphere, so they
        // scale naturally with the globe diameter. We size them generously
        // so dots and pings are legible on the 140px strip globe too.
        pointRadius={(d: object) =>
          (d as ProjectPin & { highlighted?: boolean }).highlighted ? 2.6 : 1.1
        }
        pointColor={(d: object) =>
          (d as ProjectPin & { highlighted?: boolean }).highlighted
            ? "#f1c66b"
            : "#bff0ce"
        }
        // Tooltip wrapper styling lives in `app/globals.css` under
        // `.scene-tooltip` so we override three-globe's dark default plate
        // once. Here we just emit the content; the wrapper provides the
        // cream background, border, and soft shadow.
        pointLabel={(d: object) => {
          const pin = d as ProjectPin;
          const country = pin.country
            ? `<div style="margin-top:2px;font-family:var(--font-sans),system-ui,sans-serif;font-size:9.5px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--brand-dark);opacity:0.85;">${escapeHtml(pin.country)}</div>`
            : "";
          return `<div><div style="font-weight:600;">${escapeHtml(pin.name)}</div>${country}</div>`;
        }}
        // ── Random ping rings on a sparse subset ───────────────────────────
        ringsData={rings}
        ringLat={(d: object) => (d as ProjectPin).lat}
        ringLng={(d: object) => (d as ProjectPin).lon}
        // Ring sizes are in degrees of arc on the sphere, so they scale with
        // the globe diameter. We push well above the defaults so the ping is
        // legible even on the 140px strip globe.
        ringMaxRadius={(d: object) =>
          (d as ProjectPin & { highlighted?: boolean }).highlighted ? 18 : 12
        }
        ringPropagationSpeed={2.4}
        ringAltitude={0.012}
        ringResolution={96}
        ringRepeatPeriod={(d: object) =>
          (d as ProjectPin & { repeatPeriod: number }).repeatPeriod
        }
        // Colour is a function of t∈[0,1] across each ring's life. Bright
        // primary-green at birth, eased decay to transparent.
        ringColor={(d: object) => {
          const highlighted = (d as ProjectPin & { highlighted?: boolean })
            .highlighted;
          return (t: number) => {
            const eased = Math.pow(1 - t, highlighted ? 1.15 : 1.6);
            return highlighted
              ? `rgba(241, 198, 107, ${eased * 0.98})`
              : `rgba(140, 220, 165, ${eased * 0.95})`;
          };
        }}
        animateIn={false}
      />

      {/* Loading skeleton — shown until react-globe.gl finishes mounting.
          Pure CSS so it ships with the SSR'd HTML and animates without
          waiting for the three.js bundle. Visual is a soft cream sphere
          (radial gradient suggests volume), a faint forest-green
          atmosphere ring (mirrors the loaded globe's atmosphere), and a
          handful of staggered pin dots gently pulsing to telegraph that
          this is going to become a live data view. Fades out smoothly
          once the real globe is ready. */}
      <div
        aria-hidden
        className={
          "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-500 " +
          (ready ? "opacity-0" : "opacity-100")
        }
      >
        <div className="relative" style={{ width: diameter, height: diameter }}>
          {/* Atmosphere ring (subtle outer halo — mirrors the live
              atmosphereColor `#2a4a31` at very low alpha). */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, transparent 56%, rgba(42,74,49,0.14) 68%, transparent 78%)",
            }}
          />
          {/* Sphere body — cream highlight at top-left fading to a
              warmer-grey shadow at bottom-right, giving the disc a soft
              3D feel without committing to a fake landmass illustration. */}
          <div
            className="absolute rounded-full border border-border-soft"
            style={{
              inset: "5%",
              background:
                "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.72), transparent 50%), radial-gradient(circle at center, var(--background) 30%, #e6dfd0 88%)",
              boxShadow:
                "inset 0 0 28px rgba(40,50,30,0.05), 0 1px 2px rgba(40,50,30,0.04)",
            }}
          />
          {/* Decorative pin dots — staggered slow pulse so the disc
              feels alive rather than static. */}
          {SKELETON_PINS.map((p, i) => (
            <span
              key={i}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/60"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                animation: `globeSkelPulse 3.4s ${(i * 0.42).toFixed(2)}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type GlobeVector = { x: number; y: number; z: number };

type GlobeApi = {
  camera?: () => { position?: GlobeVector };
  getCoords?: (lat: number, lng: number, altitude?: number) => GlobeVector;
};

function isPinVisibleOnGlobe(
  api: GlobeApi | null,
  pin: ProjectPin,
): boolean | null {
  const position = api?.camera?.()?.position;
  const coords = api?.getCoords?.(pin.lat, pin.lon, 0.012);
  if (!coords || !position) return null;

  const dot =
    coords.x * position.x + coords.y * position.y + coords.z * position.z;
  const pointLength = Math.hypot(coords.x, coords.y, coords.z);
  const cameraLength = Math.hypot(position.x, position.y, position.z);
  if (!pointLength || !cameraLength) return null;

  // Small positive threshold avoids showing the link while the pin is barely
  // grazing the edge of the globe.
  return dot / (pointLength * cameraLength) > 0.08;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
