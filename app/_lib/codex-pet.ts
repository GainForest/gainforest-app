// Codex-pet sprite-sheet animator.
//
// Ported from gainforest-app's `app/_lib/codex-pet.ts` (itself a port of
// simocracy-v2's sprite animator), collapsed into one file because we only
// consume it from `FloatingTainá` and don't need the validation helpers.
//
// Source format (from the OpenAI hatch-pet skill):
//   - 1536×1872 PNG or WebP, transparent
//   - 8 columns × 9 rows of 192×208 cells
//   - Each row is a named animation state with hand-tuned per-frame durations

export type CodexPetState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

const CODEX_PET_CELL_W = 192;
const CODEX_PET_CELL_H = 208;

interface CodexPetRow {
  row: number;
  durations: number[];
}

const CODEX_PET_ROWS: Record<CodexPetState, CodexPetRow> = {
  idle:            { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  "running-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left":  { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving:          { row: 3, durations: [140, 140, 140, 280] },
  jumping:         { row: 4, durations: [140, 140, 140, 140, 280] },
  failed:          { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting:         { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  running:         { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review:          { row: 8, durations: [150, 150, 150, 150, 150, 280] },
};

const sheetCache = new Map<string, HTMLImageElement>();
const sheetFailed = new Set<string>();
const inFlight = new Map<string, Promise<HTMLImageElement | null>>();

async function loadPetSheet(url: string): Promise<HTMLImageElement | null> {
  if (typeof window === "undefined") return null;
  if (sheetFailed.has(url)) return null;
  const cached = sheetCache.get(url);
  if (cached) return cached;
  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      sheetCache.set(url, img);
      inFlight.delete(url);
      resolve(img);
    };
    img.onerror = () => {
      sheetFailed.add(url);
      inFlight.delete(url);
      resolve(null);
    };
    img.src = url;
  });

  inFlight.set(url, promise);
  return promise;
}

function drawFrame(
  canvas: HTMLCanvasElement,
  sheet: HTMLImageElement,
  state: CodexPetState,
  frameIndex: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { row, durations } = CODEX_PET_ROWS[state];
  const used = durations.length;
  const col = ((frameIndex % used) + used) % used;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    sheet,
    col * CODEX_PET_CELL_W,
    row * CODEX_PET_CELL_H,
    CODEX_PET_CELL_W,
    CODEX_PET_CELL_H,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

interface AnimHandle {
  rafId: number;
  stopped: boolean;
}
const animations = new WeakMap<HTMLCanvasElement, AnimHandle>();

function stop(canvas: HTMLCanvasElement) {
  const h = animations.get(canvas);
  if (h) {
    h.stopped = true;
    cancelAnimationFrame(h.rafId);
    animations.delete(canvas);
  }
}

// Start a requestAnimationFrame loop. Returns a stop function (idempotent).
//
// `onFirstFrame` fires once when the very first frame has painted — used by
// the caller to fade out a static poster fallback without guessing at load
// timing.
export function renderPetAnimated(
  canvas: HTMLCanvasElement,
  sheetUrl: string,
  state: CodexPetState = "idle",
  onFirstFrame?: () => void,
): () => void {
  stop(canvas);
  const handle: AnimHandle = { rafId: 0, stopped: false };
  animations.set(canvas, handle);

  let sheet: HTMLImageElement | null = null;
  let frame = 0;
  let frameStart = 0;

  void loadPetSheet(sheetUrl).then((img) => {
    if (handle.stopped) return;
    sheet = img;
    if (sheet) {
      drawFrame(canvas, sheet, state, 0);
      onFirstFrame?.();
    }
    frameStart = performance.now();
  });

  const tick = (now: number) => {
    if (handle.stopped) return;
    if (sheet) {
      const { durations } = CODEX_PET_ROWS[state];
      const current = durations[frame % durations.length];
      if (now - frameStart >= current) {
        frame = (frame + 1) % durations.length;
        drawFrame(canvas, sheet, state, frame);
        frameStart = now;
      }
    }
    handle.rafId = requestAnimationFrame(tick);
  };
  handle.rafId = requestAnimationFrame(tick);

  return () => stop(canvas);
}
