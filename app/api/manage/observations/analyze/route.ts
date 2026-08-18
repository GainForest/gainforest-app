import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

// Gemini (especially the -lite tier) returns the occasional 429/5xx, empty
// candidate, or non-JSON body. Those are transient: a quick retry almost always
// succeeds. We retry the whole call a few times with jittered backoff and abort
// any single attempt that stalls, so the client sees a stable result.
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 22_000;
const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 400ms, then ~1s, with jitter so simultaneous uploads don't retry in lockstep.
function backoffDelay(attempt: number): number {
  return Math.round((400 * 2 ** attempt) * (0.7 + Math.random() * 0.6));
}

type GeminiAnalysis = {
  scientificName?: string | null;
  vernacularName?: string | null;
  kingdom?: string | null;
  eventDate?: string | null;
  recordedBy?: string | null;
  decimalLatitude?: string | null;
  decimalLongitude?: string | null;
  country?: string | null;
  locality?: string | null;
  habitat?: string | null;
  occurrenceRemarks?: string | null;
  subjectPart?: string | null;
  caption?: string | null;
  confidence?: number | null;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

type GeminiAuth = { key: string; model: string };

function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function envValue(key: string): string | null {
  return process.env[key]?.trim() || null;
}

function geminiModel(): string {
  return (envValue("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
}

async function geminiAuth(): Promise<GeminiAuth | null> {
  const apiKey = envValue("GEMINI_API_KEY");
  if (!apiKey) return null;
  return { key: apiKey, model: geminiModel() };
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCoordinate(value: unknown): string | null {
  const raw = normalizeString(value);
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(numeric) : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function normalizeSubjectPart(value: unknown): string {
  const raw = normalizeString(value)?.toLowerCase();
  if (!raw) return "wholeOrganism";
  if (["leaf", "leaves", "foliage"].includes(raw)) return "leaf";
  if (["flower", "flowers", "bloom", "blossom"].includes(raw)) return "flower";
  if (["fruit", "fruits"].includes(raw)) return "fruit";
  if (["bark", "trunk", "stem"].includes(raw)) return raw === "bark" ? "bark" : "stem";
  if (["seed", "seeds"].includes(raw)) return "seed";
  if (["animal", "bird", "insect", "fungus", "plant", "whole", "whole organism", "wholeorganism"].includes(raw)) return "wholeOrganism";
  return raw.replace(/\s+/g, "-").slice(0, 64);
}

function normalizeAnalysis(value: unknown): GeminiAnalysis {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    scientificName: normalizeString(record.scientificName) ?? "Unidentified organism",
    vernacularName: normalizeString(record.vernacularName),
    kingdom: normalizeString(record.kingdom) ?? "Plantae",
    eventDate: normalizeString(record.eventDate),
    recordedBy: normalizeString(record.recordedBy),
    decimalLatitude: normalizeCoordinate(record.decimalLatitude),
    decimalLongitude: normalizeCoordinate(record.decimalLongitude),
    country: normalizeString(record.country),
    locality: normalizeString(record.locality),
    habitat: normalizeString(record.habitat),
    occurrenceRemarks: normalizeString(record.occurrenceRemarks),
    subjectPart: normalizeSubjectPart(record.subjectPart),
    caption: normalizeString(record.caption),
    confidence: normalizeConfidence(record.confidence),
  };
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found.");
    return JSON.parse(match[0]);
  }
}

async function callGemini(auth: GeminiAuth, prompt: string, mimeType: string, imageBytes: Buffer): Promise<Response> {
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBytes.toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    return await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(auth.model)}:generateContent?key=${encodeURIComponent(auth.key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}

type AttemptResult =
  | { ok: true; analysis: GeminiAnalysis }
  | { ok: false; retryable: boolean };

// One full request → parse cycle. Network/abort errors, retryable HTTP statuses,
// empty candidates, and unparseable bodies are all reported as retryable so the
// caller can try again; anything else is a hard failure.
async function analyzeOnce(auth: GeminiAuth, prompt: string, mimeType: string, bytes: Buffer): Promise<AttemptResult> {
  let response: Response;
  try {
    response = await callGemini(auth, prompt, mimeType, bytes);
  } catch {
    return { ok: false, retryable: true };
  }

  const data = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok || data?.error) {
    return { ok: false, retryable: RETRY_STATUS.has(response.status) };
  }

  const text = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) return { ok: false, retryable: true };

  try {
    return { ok: true, analysis: normalizeAnalysis(extractJson(text)) };
  } catch {
    return { ok: false, retryable: true };
  }
}

export async function POST(request: Request) {
  const auth = await geminiAuth().catch(() => null);
  if (!auth) return jsonError("not_configured", 503);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("image");
  if (!(file instanceof File)) return jsonError("missing_image", 400);

  const mimeType = file.type.split(";")[0]?.toLowerCase() ?? "";
  if (!ACCEPTED_IMAGE_TYPES.has(mimeType)) return jsonError("unsupported_image", 400);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return jsonError("image_too_large", 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const prompt = `Analyze this field observation photo and return only JSON. Fill fields for a biodiversity observation record. If a value is not visible, use null, except scientificName should be "Unidentified organism" when uncertain and eventDate may be null. Use ISO dates when possible. Coordinates must be decimal strings if visible in metadata or image context. Choose subjectPart like wholeOrganism, leaf, flower, fruit, bark, stem, seed, animal, fungus. Include a short caption and occurrenceRemarks that explain what is visible. Return keys: scientificName, vernacularName, kingdom, eventDate, recordedBy, decimalLatitude, decimalLongitude, country, locality, habitat, occurrenceRemarks, subjectPart, caption, confidence.`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await analyzeOnce(auth, prompt, mimeType, bytes);
    if (result.ok) return NextResponse.json({ analysis: result.analysis });
    if (!result.retryable || attempt === MAX_ATTEMPTS - 1) break;
    await sleep(backoffDelay(attempt));
  }

  return jsonError("analysis_failed", 502);
}
