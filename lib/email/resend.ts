import { request } from "node:https";

const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";
const DEFAULT_EMAIL_FROM = "GainForest <noreply@gainforest.id>";

export class EmailSendError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
  }
}

function getEmailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
}

async function postJson(url: string, headers: Record<string, string>, payload: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  json: { id?: unknown; message?: unknown; error?: unknown } | null;
}> {
  const body = JSON.stringify(payload);
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
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
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json: { id?: unknown; message?: unknown; error?: unknown } | null = null;
        try {
          json = raw ? JSON.parse(raw) as { id?: unknown; message?: unknown; error?: unknown } : null;
        } catch {
          json = null;
        }
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, json });
      });
    });
    req.on("error", reject);
    req.setTimeout(15_000, () => req.destroy(new Error("Resend request timed out.")));
    req.write(body);
    req.end();
  });
}

export async function sendResendEmail({
  to,
  subject,
  html,
  text,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
}): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
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

  const response = await postJson(RESEND_EMAILS_API_URL, headers, {
    from: getEmailFrom(),
    to: [to],
    subject,
    html,
    ...(text ? { text } : {}),
  });

  const payload = response.json;
  if (!response.ok) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
        ? payload.error
        : "Resend could not send the welcome email.";
    throw new EmailSendError(message, response.status || 502);
  }

  return { id: typeof payload?.id === "string" ? payload.id : null };
}
