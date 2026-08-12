/**
 * Tiny area sparkline in the Bumiscan (scan.gainforest.app) style: a thin
 * primary-colored polyline over a soft primary fill, drawn edge-to-edge with
 * a non-scaling stroke so it stays crisp at any rendered size.
 */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  // Leave 1px of headroom so the stroke never clips at the peak.
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * 100,
    31 - (value / max) * 30,
  ]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x!.toFixed(1)},${y!.toFixed(1)}`).join(" ");
  const area = `${line} L100,32 L0,32 Z`;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={area} fill="var(--primary)" opacity="0.12" />
      <path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
