/**
 * Geometry of the soundscape dial's radial axis, kept out of the chart
 * component so the scale itself can be tested.
 */

/**
 * Maps a PMN value onto a radius: 0 at the inner edge, `maxValue` at the
 * outer one.
 *
 * The reference matplotlib figure ran the domain from -maxValue to +maxValue,
 * putting 0 at mid-radius. PMN is a sum of decibels above the noise floor and
 * so is never negative, so that spent half the dial on values that cannot
 * occur and squeezed every line into the outer ring. Anchoring 0 at the inner
 * edge doubles the radius available to the data without changing what any
 * value means — the grid labels still read in PMN, they are simply no longer
 * offset by half the scale.
 */
export function radiusForValue(
  value: number,
  maxValue: number,
  innerRadius: number,
  outerRadius: number,
): number {
  if (maxValue <= 0) return innerRadius;
  const clamped = Math.max(0, Math.min(value, maxValue));
  return innerRadius + (clamped / maxValue) * (outerRadius - innerRadius);
}
