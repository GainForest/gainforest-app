import { NextRequest } from "next/server";
import {
  buildSystemPrompt,
  getTainaPersona,
  TAINA_SIM,
} from "../../_lib/taina-sim";
import { openRouterChat } from "../../_lib/openrouter";
import { asLocale, LOCALE_LABELS } from "../../_lib/i18n";

export const dynamic = "force-dynamic";

// `/api/sim-chat` — streams a chat reply in the Taina sim's voice.
//
// Trimmed port of `simocracy-v2/app/api/feedback-chat/route.ts`. Differences:
//   - No auth gate. The landing's floating companion is for any visitor.
//     (Anonymous traffic still costs OpenRouter credits; see `MAX_PER_MIN`
//     below for the basic rate cap.)
//   - The companion is fixed to one sim (Taina). No companion-picker
//     payload, no per-user companion record.
//   - The system prompt is built fresh per request but the persona fetch
//     is cached by Next ISR via fetch() revalidate inside `getTainaPersona`.

const MAX_MESSAGES = 20;
const MAX_CONTENT_CHARS = 4000;
const MAX_PER_MIN = 30; // very rough per-IP throttle

// In-memory per-IP rate counter. Resets every minute. Good enough for a
// landing-page anti-abuse barrier; a real deployment would use Redis.
const buckets = new Map<string, { count: number; windowStart: number }>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = buckets.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    buckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_MIN;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "anon";
    if (!rateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "Slow down — too many messages this minute." }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rawMessages = (body as {
      messages?: Array<{ role: string; content: string }>;
      locale?: string;
    }).messages;
    const locale = asLocale(
      (body as { locale?: string }).locale ?? null,
    );
    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages = rawMessages
      .slice(-MAX_MESSAGES)
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content).slice(0, MAX_CONTENT_CHARS),
      }));

    const persona = await getTainaPersona();
    let systemPrompt = buildSystemPrompt(persona);
    // Append a language directive when the visitor is not on English so
    // Taina replies match the page they're reading. The directive goes
    // AFTER the persona reminder so it carries the most recency weight;
    // the persona itself stays untouched. (Taina's constitution
    // already says she speaks EN/PT/ES/Bahasa/Swahili by default, so
    // this directive is mostly a hint about *which* of those to lean
    // into for the current page render.)
    if (locale !== "en") {
      const languageName = LOCALE_LABELS[locale].english;
      systemPrompt += `\n\n## Language\nThe visitor has switched the page to ${languageName} (${LOCALE_LABELS[locale].native}). Reply in ${languageName}, in your own voice. Keep brand names (GainForest, Bumicerts, Taina) as-is. If the visitor writes in a different language, mirror theirs.`;
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Chat is not configured on this server — set OPENROUTER_API_KEY in .env.local.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const res = await openRouterChat({
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      maxTokens: 800,
      temperature: 0.8,
      stream: true,
      title: `GainForest companion (${TAINA_SIM.name})`,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[sim-chat] OpenRouter error", res.status, err);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[sim-chat] failed", err);
    return new Response(JSON.stringify({ error: "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
