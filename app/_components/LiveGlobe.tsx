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
 * gainforest.app's `/api/list-organizations?info=true&mapPoint=true` route.
 * That route walks Hyperindex → each org's `defaultSite` → the certified
 * location GeoJSON blob on the PDS, computes a centroid with Turf, and
 * returns `{ did, info, mapPoint }`. We then filter exactly the way
 * green_globe's `useIndexedOrganizations` filters — keep only entries
 * with both `info` and `mapPoint` non-null — so we render the same set of
 * ATProto-sourced pins gainforest.app's deployed globe renders.
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
   * Enable user-driven interaction (drag-to-rotate + wheel/pinch zoom).
   *
   * Default `false`: the globe is a "frozen" decorative widget — fixed
   * scale, auto-rotates until the user grabs it once, doesn't capture
   * wheel events (so the page scrolls over it cleanly). That mode is
   * used by the floating hero card and the small ChoosePath preview
   * thumbnail.
   *
   * `true`: full free-camera mode — drag rotates, wheel/pinch zooms
   * within a `[0.6×, 1.4×]` window of the initial camera distance,
   * auto-rotate still stops on first grab. Used by the embedded
   * "What's Green Globe?" preview so visitors can play with the
   * sphere right inside the card instead of having to click
   * through to gainforest.app first.
   */
  interactive?: boolean;
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

export function LiveGlobe({ pins, diameter, interactive = false }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The Globe instance ref — used to drive auto-rotate + controls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

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
    if (interactive) {
      // Interactive mode: allow drag-to-rotate (already on by default
      // via OrbitControls) and wheel/pinch zoom, but clamp the zoom
      // range so the user can't push the camera through the sphere or
      // pull it out of frame. The `[0.6×, 1.4×]` window around the
      // initial distance lines up with what a "preview" globe should
      // do — let people peek closer at a region and zoom back out,
      // not free-fly. Pan stays disabled so the sphere always stays
      // centred in the card.
      const d0 = controls.getDistance?.() ?? 0;
      controls.enableZoom = true;
      controls.enablePan = false;
      controls.minDistance = d0 * 0.6;
      controls.maxDistance = d0 * 1.4;
    } else {
      // Static mode: hard-disable every zoom path so the globe stays a
      // fixed scale (used by the floating hero card and the small
      // ChoosePath thumbnail).
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.minDistance = controls.maxDistance = controls.getDistance?.() ?? 0;
    }

    const stopSpin = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener?.("start", stopSpin);
  };

  // Wheel handling differs between modes.
  //
  // Static mode: even with `enableZoom = false`, three.js still binds a
  // wheel listener and would block the page from scrolling over the
  // globe. We capture wheel events on the container and let them bubble
  // to the page normally.
  //
  // Interactive mode: we WANT the wheel to zoom the globe, so we leave
  // three.js's listener alone. The page can't scroll through the
  // sphere — that's the expected trade-off for an interactive widget,
  // and the visitor can scroll the page from any of the surrounding
  // cream / card chrome.
  useEffect(() => {
    if (interactive) return;
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
  }, [interactive]);

  // Memoise the points and ring datasets so the globe doesn't redraw on each
  // re-render. Pings stagger pseudo-randomly across pins for the "real data
  // is alive" effect — every pin gets its own ringRepeatPeriod and offset.
  const { points, rings } = useMemo(() => {
    const points = pins.map((pin) => ({
      ...pin,
      altitude: 0.012,
    }));

    // Pick a sparse subset of pins for ping rings — small enough to stay
    // calm but not so small that you wait forever to see one.
    const stride = Math.max(1, Math.ceil(pins.length / MAX_PINGING_PINS));
    const ringPins = pins.filter((_, i) => i % stride === 0);
    const rings = ringPins.map((pin, i) => ({
      ...pin,
      // 4–9 second period, staggered so they fire at different beats.
      repeatPeriod: 4000 + ((i * 1303) % 5000),
    }));

    return { points, rings };
  }, [pins]);

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
        pointRadius={1.1}
        pointColor={() => "#bff0ce"}
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
        ringMaxRadius={12}
        ringPropagationSpeed={2.4}
        ringAltitude={0.012}
        ringResolution={96}
        ringRepeatPeriod={(d: object) =>
          (d as ProjectPin & { repeatPeriod: number }).repeatPeriod
        }
        // Colour is a function of t∈[0,1] across each ring's life. Bright
        // primary-green at birth, eased decay to transparent.
        ringColor={() => (t: number) => {
          const eased = Math.pow(1 - t, 1.6);
          return `rgba(140, 220, 165, ${eased * 0.95})`;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
