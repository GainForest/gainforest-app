import { buildSystemPrompt, getTainaPersona, TAINA_SIM } from "@/app/_lib/taina-sim";
import { openRouterChat } from "@/app/_lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `/api/sim-chat` — streams a chat reply in the Taina sim's voice.
//
// Ported from gainforest-app's `app/api/sim-chat/route.ts`, trimmed for this
// app: the Bumicert authoring companion is English-only, so the locale /
// language-directive machinery is dropped. The system prompt is built fresh
// per request, but the persona fetch is cached by Next ISR via fetch()
// revalidate inside `getTainaPersona`.

const MAX_MESSAGES = 20;
const MAX_CONTENT_CHARS = 4000;
const MAX_PER_MIN = 30; // very rough per-IP throttle

// In-memory per-IP rate counter. Resets every minute. Good enough for an
// anti-abuse barrier; a real deployment would use Redis.
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

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "anon";
    if (!rateLimit(ip)) {
      return Response.json(
        { error: "Slow down; too many messages this minute." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "I could not read that message." }, { status: 400 });
    }

    const rawMessages = (body as {
      messages?: Array<{ role: string; content: string }>;
    }).messages;
    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      return Response.json({ error: "Please write a message first." }, { status: 400 });
    }

    const messages = rawMessages
      .slice(-MAX_MESSAGES)
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content).slice(0, MAX_CONTENT_CHARS),
      }));

    const persona = await getTainaPersona();
    const systemPrompt = buildSystemPrompt(persona);

    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json(
        {
          error: "Taina is not set up on this server yet.",
        },
        { status: 503 },
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
      return Response.json({ error: "Taina is briefly unreachable." }, { status: 502 });
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
    return Response.json({ error: "Taina could not reply right now." }, { status: 500 });
  }
}
