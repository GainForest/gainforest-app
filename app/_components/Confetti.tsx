"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "#16a34a",
  "#22c55e",
  "#84cc16",
  "#fde047",
  "#f97316",
  "#38bdf8",
  "#ec4899",
];

type Piece = {
  id: number;
  left: number;
  drift: number;
  rot: number;
  duration: number;
  delay: number;
  size: number;
  color: string;
  circle: boolean;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    drift: (Math.random() * 2 - 1) * 180,
    rot: Math.random() * 960 - 480,
    duration: 1.9 + Math.random() * 1.3,
    delay: Math.random() * 0.35,
    size: 7 + Math.random() * 9,
    color: CONFETTI_COLORS[id % CONFETTI_COLORS.length],
    circle: Math.random() > 0.55,
  }));
}

const CONFETTI_CSS = `
@keyframes gf-confetti-fall {
  0% { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translate3d(var(--gf-drift), 110vh, 0) rotate(var(--gf-rot)); opacity: 0; }
}
.gf-confetti-piece {
  position: absolute;
  top: 0;
  will-change: transform, opacity;
  animation-name: gf-confetti-fall;
  animation-timing-function: cubic-bezier(0.18, 0.7, 0.35, 1);
  animation-fill-mode: forwards;
}
@media (prefers-reduced-motion: reduce) {
  .gf-confetti-piece { display: none; }
}
`;

/** A one-shot celebratory confetti burst rendered into a body-level portal so it
 *  rains over the whole viewport. Self-removes after the animation completes;
 *  fully hidden under prefers-reduced-motion. */
export function Confetti({ onDone, count = 110 }: { onDone?: () => void; count?: number }) {
  const pieces = useMemo(() => makePieces(count), [count]);
  const [mounted, setMounted] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setMounted(true);
    const id = window.setTimeout(() => doneRef.current?.(), 3400);
    return () => window.clearTimeout(id);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      <style>{CONFETTI_CSS}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="gf-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.circle ? p.size : p.size * 0.6,
            height: p.size,
            background: p.color,
            borderRadius: p.circle ? "9999px" : "2px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ["--gf-drift" as string]: `${p.drift}px`,
            ["--gf-rot" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
