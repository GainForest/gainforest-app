"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Interactive isometric illustration of a personal data server — inspired by
 * the "agent harness" slab on flueframework.com. A two-layer isometric slab
 * with engraved side labels, topped by a grid of diamond tiles that:
 *   • shimmer with a slow travelling wave (a "living data" pulse), and
 *   • light up under the pointer (a soft ripple following the cursor).
 * The lit tiles trace a tree/sprout emblem, tying the server to the
 * "Rewilding the Web" theme. Everything is theme-aware via CSS variables, so
 * it adapts to light and dark automatically.
 */

export type PdsVisualLabels = {
  /** Accessible description of the whole illustration. */
  aria: string;
  /** Plain-language caption shown under the slab. */
  caption: string;
  /** Engraved name of the top layer (left face, upper band). */
  dataLayer: string;
  /** Engraved name of the bottom layer (left face, lower band). */
  serverLayer: string;
  /** Engraved contents of the top layer (right face, upper band). */
  contentsTop: string;
  /** Engraved contents of the bottom layer (right face, lower band). */
  contentsBottom: string;
};

const VIEW_W = 520;
const VIEW_H = 332;

const N = 12; // tiles per side of the top grid
const TILE_W = 30;
const TILE_H = 15;
const ORIGIN_X = 260;
const ORIGIN_Y = 60;
const LAYER_DEPTH = 34; // thickness of each stacked layer
const DEPTH = LAYER_DEPTH * 2;

// Top-face outer corners (a flat diamond).
const T = { x: ORIGIN_X, y: ORIGIN_Y - TILE_H / 2 };
const R = { x: ORIGIN_X + N * (TILE_W / 2), y: ORIGIN_Y + (N - 1) * (TILE_H / 2) };
const B = { x: ORIGIN_X, y: ORIGIN_Y + (2 * N - 1) * (TILE_H / 2) };
const L = { x: ORIGIN_X - N * (TILE_W / 2), y: ORIGIN_Y + (N - 1) * (TILE_H / 2) };

const TOP_FACE = `${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`;
const LEFT_FACE = `${L.x},${L.y} ${B.x},${B.y} ${B.x},${B.y + DEPTH} ${L.x},${L.y + DEPTH}`;
const RIGHT_FACE = `${B.x},${B.y} ${R.x},${R.y} ${R.x},${R.y + DEPTH} ${B.x},${B.y + DEPTH}`;

// Mid-depth divider between the two stacked layers.
const LEFT_DIVIDER = `${L.x},${L.y + LAYER_DEPTH} ${B.x},${B.y + LAYER_DEPTH}`;
const RIGHT_DIVIDER = `${B.x},${B.y + LAYER_DEPTH} ${R.x},${R.y + LAYER_DEPTH}`;

const ISO_ANGLE = (Math.atan2(B.y - L.y, B.x - L.x) * 180) / Math.PI; // ≈ 26.57°

type Tile = { points: string; cx: number; cy: number; phase: number; lit: boolean };

function inTriangle(px: number, py: number): boolean {
  // Tree canopy: apex + two base corners.
  const ax = 260, ay = 78, bx = 202, by = 178, cx = 318, cy = 178;
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function isEmblem(px: number, py: number): boolean {
  // Canopy triangle, plus a short trunk below it.
  if (inTriangle(px, py)) return true;
  return px >= 250 && px <= 270 && py >= 178 && py <= 202;
}

function buildTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let col = 0; col < N; col += 1) {
    for (let row = 0; row < N; row += 1) {
      const cx = ORIGIN_X + (col - row) * (TILE_W / 2);
      const cy = ORIGIN_Y + (col + row) * (TILE_H / 2);
      const points = `${cx},${cy - TILE_H / 2} ${cx + TILE_W / 2},${cy} ${cx},${cy + TILE_H / 2} ${cx - TILE_W / 2},${cy}`;
      tiles.push({ points, cx, cy, phase: col + row, lit: isEmblem(cx, cy) });
    }
  }
  return tiles;
}

export function PdsVisual({ labels, className }: { labels: PdsVisualLabels; className?: string }) {
  const tiles = useMemo(buildTiles, []);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const reducedRef = useRef(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const node = svgRef.current;
    let raf = 0;
    let last = 0;
    let visible = true;

    const loop = (time: number) => {
      if (time - last >= 28) {
        last = time;
        setNow(time);
      }
      raf = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    // Pause the animation loop while the slab is off-screen.
    const observer =
      node && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              if (visible) start();
              else stop();
            },
            { threshold: 0.05 },
          )
        : null;
    if (observer && node) observer.observe(node);
    else start();

    return () => {
      stop();
      if (observer) observer.disconnect();
    };
  }, []);

  const updatePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H,
      on: true,
    };
  };

  const clearPointer = () => {
    pointerRef.current = { ...pointerRef.current, on: false };
  };

  const wave = reducedRef.current ? 0 : 1;
  const pointer = pointerRef.current;

  const tileOpacity = (tile: Tile): number => {
    const base = tile.lit ? 0.82 : 0.08;
    const shimmer = wave * (tile.lit ? 0.16 : 0.05) * Math.sin(now * 0.0022 - tile.phase * 0.55);
    let ripple = 0;
    if (pointer.on) {
      const dx = tile.cx - pointer.x;
      const dy = (tile.cy - pointer.y) * 2; // un-squash the iso projection
      const d2 = dx * dx + dy * dy;
      ripple = 0.6 * Math.exp(-d2 / (2 * 58 * 58));
    }
    return Math.max(0.04, Math.min(1, base + shimmer + ripple));
  };

  return (
    <figure className={className} aria-label={labels.aria}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={labels.aria}
        onPointerMove={updatePointer}
        onPointerLeave={clearPointer}
        className="w-full touch-none select-none"
        style={{ overflow: "visible" }}
      >
        {/* Soft ground shadow */}
        <ellipse cx={ORIGIN_X} cy={B.y + DEPTH + 6} rx={186} ry={22} fill="var(--foreground)" opacity={0.06} />

        {/* Slab body */}
        <polygon points={LEFT_FACE} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
        <polygon points={RIGHT_FACE} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
        {/* Shade the right face slightly for depth */}
        <polygon points={RIGHT_FACE} fill="var(--foreground)" opacity={0.04} />
        <polyline points={LEFT_DIVIDER} fill="none" stroke="var(--border)" strokeWidth={1} />
        <polyline points={RIGHT_DIVIDER} fill="none" stroke="var(--border)" strokeWidth={1} />

        {/* Engraved labels */}
        <g
          fill="var(--muted-foreground)"
          fontFamily="var(--font-geist-mono, ui-monospace, monospace)"
          style={{ pointerEvents: "none" }}
        >
          <text x={170} y={207} fontSize={12} fontWeight={600} letterSpacing="1.5" textAnchor="middle" transform={`rotate(${ISO_ANGLE} 170 207)`}>
            {labels.dataLayer}
          </text>
          <text x={170} y={241} fontSize={12} fontWeight={600} letterSpacing="1.5" textAnchor="middle" transform={`rotate(${ISO_ANGLE} 170 241)`}>
            {labels.serverLayer}
          </text>
          <text x={350} y={207} fontSize={8} letterSpacing="0.6" textAnchor="middle" transform={`rotate(${-ISO_ANGLE} 350 207)`}>
            {labels.contentsTop}
          </text>
          <text x={350} y={241} fontSize={8} letterSpacing="0.6" textAnchor="middle" transform={`rotate(${-ISO_ANGLE} 350 241)`}>
            {labels.contentsBottom}
          </text>
        </g>

        {/* Top face surface under the tiles */}
        <polygon points={TOP_FACE} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />

        {/* Animated tile field */}
        <g>
          {tiles.map((tile, index) => (
            <polygon
              key={index}
              points={tile.points}
              fill="var(--primary)"
              fillOpacity={tileOpacity(tile)}
              stroke="var(--primary)"
              strokeOpacity={0.1}
              strokeWidth={0.5}
            />
          ))}
        </g>
      </svg>

      <figcaption className="mt-2 text-center text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {labels.caption}
      </figcaption>
    </figure>
  );
}
