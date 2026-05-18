"use client";

import Image from "next/image";
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
  fallbackSrc: string;
  diameter: number;
};

export function LiveGlobe({ pins, fallbackSrc, diameter }: GlobeProps) {
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
    // Hard-disable every zoom path so the globe stays a fixed scale.
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minDistance = controls.maxDistance = controls.getDistance?.() ?? 0;

    const stopSpin = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener?.("start", stopSpin);
  };

  // Safety net: even with `enableZoom = false`, three.js still listens for
  // wheel events on the canvas and the page won't scroll over the globe.
  // Capturing the wheel event on the container lets the page scroll like
  // normal and stops any latent zoom behaviour.
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
            ? `<div style="margin-top:2px;font-family:var(--font-sans),system-ui,sans-serif;font-size:9.5px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--primary);opacity:0.75;">${escapeHtml(pin.country)}</div>`
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

      {/* Static-image fallback shown until react-globe.gl finishes mounting. */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Image
            src={fallbackSrc}
            alt=""
            width={diameter}
            height={diameter}
            unoptimized
            priority
            className="opacity-90"
          />
        </div>
      )}
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
