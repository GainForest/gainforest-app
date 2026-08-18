import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";
const DEFAULT_EMAIL_FROM = "GainForest <noreply@gainforest.id>";

export class EmailSendError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, status = 502, code?: string, retryAfterMs?: number) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

function getEmailFrom(from: string | undefined): string {
  return from?.trim() || process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<{
  ok: boolean;
  status: number;
  json: { id?: unknown; name?: unknown; message?: unknown; error?: unknown } | null;
  retryAfterMs?: number;
}> {
  const body = JSON.stringify(payload);
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Resend API URL must use HTTP or HTTPS.");
  }

  return new Promise((resolve, reject) => {
    const request = parsedUrl.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: "POST",
      family: 4,
      headers: {
        ...headers,
        "content-length": Buffer.byteLength(body).toString(),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("error", reject);
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json: { id?: unknown; name?: unknown; message?: unknown; error?: unknown } | null = null;
        try {
          json = raw ? JSON.parse(raw) as { id?: unknown; name?: unknown; message?: unknown; error?: unknown } : null;
        } catch {
          json = null;
        }
        const status = res.statusCode ?? 0;
        const retryAfter = Array.isArray(res.headers["retry-after"])
          ? res.headers["retry-after"][0]
          : res.headers["retry-after"];
        const retryAfterSeconds = retryAfter === undefined ? Number.NaN : Number(retryAfter);
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? retryAfterSeconds * 1000
          : undefined;
        resolve({ ok: status >= 200 && status < 300, status, json, retryAfterMs });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Resend request timed out.")));
    req.write(body);
    req.end();
  });
}

export async function sendResendEmail({
  from,
  to,
  subject,
  html,
  text,
  idempotencyKey,
  timeoutMs = 15_000,
  apiKey: suppliedApiKey,
  apiUrl,
}: {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  apiKey?: string;
  apiUrl?: string;
}): Promise<{ id: string | null }> {
  const apiKey = suppliedApiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new EmailSendError("Resend is not configured for welcome emails.", 503);
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  if (idempotencyKey?.trim()) {
    headers["idempotency-key"] = idempotencyKey.trim().slice(0, 256);
  }

  const response = await postJson(apiUrl?.trim() || RESEND_EMAILS_API_URL, headers, {
    from: getEmailFrom(from),
    to: [to],
    subject,
    html,
    ...(text ? { text } : {}),
  }, timeoutMs);

  const payload = response.json;
  if (!response.ok) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
        ? payload.error
        : "Resend could not send the welcome email.";
    throw new EmailSendError(
      message,
      response.status || 502,
      typeof payload?.name === "string" ? payload.name : undefined,
      response.retryAfterMs,
    );
  }

  return { id: typeof payload?.id === "string" ? payload.id : null };
}
