// Minimal OpenRouter client. Ported from gainforest-app's
// `app/_lib/openrouter.ts`.

export const DEFAULT_CHAT_MODEL =
  process.env.DEFAULT_CHAT_MODEL ?? "google/gemini-2.5-flash";

export class OpenRouterConfigError extends Error {
  constructor(message = "OPENROUTER_API_KEY missing") {
    super(message);
    this.name = "OpenRouterConfigError";
  }
}

export interface OpenRouterChatOptions {
  model?: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  title?: string;
}

export async function openRouterChat(
  opts: OpenRouterChatOptions,
): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterConfigError();

  const stream = opts.stream ?? true;
  const payload: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_CHAT_MODEL,
    messages: opts.messages,
    stream,
  };
  if (opts.maxTokens !== undefined) payload.max_tokens = opts.maxTokens;
  if (opts.temperature !== undefined) payload.temperature = opts.temperature;

  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3040",
      "X-Title": opts.title ?? "GainForest",
    },
    body: JSON.stringify(payload),
  });
}
