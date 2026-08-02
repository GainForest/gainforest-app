/**
 * Organization marker badges — small circular icons for the globe.
 *
 * Every organization pin shows that org's own logo (cropped into a thin-ring
 * circle). Orgs without a resolvable avatar fall back to a neutral, unbranded
 * dot badge at the same compact size — never another organization's mark —
 * so the globe reads as one consistent, minimal marker system without
 * misattributing sites to GainForest or Ma Earth.
 */

/** Display diameter in CSS pixels — small and unobtrusive vs. the old ~36-42px pins. */
const ORG_BADGE_SIZE_CSS = 20;
const ORG_BADGE_RING_CSS = 1.25;

export const DEFAULT_BADGE_ID = "orgBadgeDefault";

export function orgLogoImageId(did: string): string {
  return `orgLogo:${did}`;
}

export type BadgeImage = { image: ImageData; pixelRatio: number };

function badgeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; size: number; dpr: number } {
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const size = Math.round(ORG_BADGE_SIZE_CSS * dpr);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return { canvas, ctx, size, dpr };
}

function strokeRing(ctx: CanvasRenderingContext2D, size: number, dpr: number) {
  const ringWidth = ORG_BADGE_RING_CSS * dpr;
  const r = Math.max(size / 2 - ringWidth / 2, 0);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = ringWidth;
  ctx.stroke();
}

function sourceDimensions(source: CanvasImageSource): [number, number] | null {
  if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight];
  if (source instanceof HTMLCanvasElement) return [source.width, source.height];
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) return [source.width, source.height];
  return null;
}

/** Load a same-origin/CORS-served raster image so its pixels can be read back onto a canvas. */
export function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${url}`));
    img.src = url;
  });
}

/** Crop a raster image into the shared circular badge (org avatars, Ma Earth mark). */
export function buildCircleBadge(source: CanvasImageSource, mode: "cover" | "contain" = "cover"): BadgeImage {
  const { ctx, size, dpr } = badgeCanvas();
  const ringWidth = ORG_BADGE_RING_CSS * dpr;
  const cx = size / 2;
  const cy = size / 2;
  const r = Math.max(size / 2 - ringWidth / 2, 0);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const dims = sourceDimensions(source);
  if (dims && dims[0] > 0 && dims[1] > 0) {
    const [sw, sh] = dims;
    const fit = mode === "cover" ? Math.max(size / sw, size / sh) : Math.min(size / sw, size / sh) * 0.72;
    const dw = sw * fit;
    const dh = sh * fit;
    ctx.drawImage(source, cx - dw / 2, cy - dh / 2, dw, dh);
  }
  ctx.restore();

  strokeRing(ctx, size, dpr);
  return { image: ctx.getImageData(0, 0, size, size), pixelRatio: dpr };
}

// ── Neutral fallback badge (unbranded dot — drawn client-side, no image
//    fetch needed) ──────────────────────────────────────────────────────────

export function buildDefaultBadge(): BadgeImage {
  const { ctx, size, dpr } = badgeCanvas();
  const cx = size / 2;
  const cy = size / 2;
  const ringWidth = ORG_BADGE_RING_CSS * dpr;
  const r = Math.max(size / 2 - ringWidth / 2, 0);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#26332d";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  strokeRing(ctx, size, dpr);
  return { image: ctx.getImageData(0, 0, size, size), pixelRatio: dpr };
}
