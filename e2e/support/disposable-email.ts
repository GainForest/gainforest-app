import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const disposableAccountMetadataPath = "e2e/.auth/disposable-account.json";
export const memberDisposableAccountMetadataPath = "e2e/.auth/member-account.json";

type GuerrillaMailMessage = {
  id: string;
  subject: string;
};

export type DisposableInbox = {
  provider: "guerrillamail";
  email: string;
  sidToken: string;
  cookie: string;
};

export type DisposableAccountMetadata = {
  source: "disposable-email-auth";
  createdAt: string;
  email: string;
  inbox: DisposableInbox;
  did: string | null;
  handle: string | null;
  serviceEndpoint: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function randomUserPart(): string {
  const configured = process.env.E2E_DISPOSABLE_EMAIL_PREFIX?.trim() || "gf-e2e";
  const suffix = Math.random().toString(36).slice(2, 13);
  return `${configured.replace(/[^a-z0-9]/gi, "").toLowerCase()}${suffix}`.slice(0, 32);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractOtp(text: string): string | null {
  return text.match(/\b(\d{6})\b/)?.[1] ?? null;
}

function extractAccountActionToken(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ");
  const hyphenatedToken = normalized.match(/\b([a-z0-9]{5}-[a-z0-9]{5})\b/i);
  if (hyphenatedToken?.[1]) return hyphenatedToken[1];

  const labeled = normalized.match(/(?:delete|deletion|reset|password|confirmation|token|code)[^a-z0-9]{1,80}([a-z0-9-]{6,})/i);
  if (labeled?.[1]) return labeled[1];

  return extractOtp(normalized);
}

async function guerrillaJson(url: string, cookie?: string): Promise<unknown> {
  const response = await fetch(url, cookie ? { headers: { cookie } } : undefined);
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    throw new Error(`Disposable email request failed: ${response.status} ${response.statusText}`);
  }
  return body;
}

export async function createDisposableInbox(): Promise<DisposableInbox> {
  const emailUser = randomUserPart();
  const value = await guerrillaJson(
    `https://api.guerrillamail.com/ajax.php?f=set_email_user&email_user=${encodeURIComponent(emailUser)}`,
  );

  if (!isObject(value) || typeof value.sid_token !== "string") {
    throw new Error("Disposable email service did not return an inbox session.");
  }

  return {
    provider: "guerrillamail",
    email: `${emailUser}@guerrillamailblock.com`,
    sidToken: value.sid_token,
    cookie: `PHPSESSID=${value.sid_token}`,
  };
}

export async function listDisposableEmailMessages(inbox: DisposableInbox): Promise<GuerrillaMailMessage[]> {
  const value = await guerrillaJson(
    `https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=${encodeURIComponent(inbox.sidToken)}`,
    inbox.cookie,
  );
  if (!isObject(value) || !Array.isArray(value.list)) return [];

  return value.list
    .filter((entry): entry is Record<string, unknown> => isObject(entry) && Number(entry.mail_id) !== 1)
    .map((entry) => ({
      id: String(entry.mail_id ?? ""),
      subject: typeof entry.mail_subject === "string" ? entry.mail_subject : "",
    }))
    .filter((entry) => entry.id.length > 0);
}

async function readDisposableEmailMessage(inbox: DisposableInbox, id: string): Promise<string> {
  const value = await guerrillaJson(
    `https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${encodeURIComponent(id)}&sid_token=${encodeURIComponent(inbox.sidToken)}`,
    inbox.cookie,
  );
  if (!isObject(value)) return "";
  const subject = typeof value.mail_subject === "string" ? value.mail_subject : "";
  const body = typeof value.mail_body === "string" ? stripHtml(value.mail_body) : "";
  return `${subject}\n${body}`;
}

async function waitForInboxMatch(options: {
  inbox: DisposableInbox;
  ignoredMessageIds?: Set<string>;
  timeoutMs?: number;
  description: string;
  extract: (text: string) => string | null;
}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.E2E_DISPOSABLE_EMAIL_TIMEOUT_MS ?? 150_000);
  const deadline = Date.now() + timeoutMs;
  let lastSubjects = "";

  while (Date.now() <= deadline) {
    const messages = await listDisposableEmailMessages(options.inbox);
    lastSubjects = messages.map((message) => message.subject || message.id).join(" | ");

    for (const message of messages) {
      if (options.ignoredMessageIds?.has(message.id)) continue;
      const match = options.extract(await readDisposableEmailMessage(options.inbox, message.id));
      if (match) return match;
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new Error(`Timed out waiting for ${options.description} for ${options.inbox.email}. Last inbox subjects: ${lastSubjects || "none"}.`);
}

export async function waitForInboxOtp(inbox: DisposableInbox, ignoredMessageIds = new Set<string>()): Promise<string> {
  return waitForInboxMatch({
    inbox,
    ignoredMessageIds,
    description: "disposable inbox code",
    extract: extractOtp,
  });
}

export async function waitForInboxPasswordResetToken(
  inbox: DisposableInbox,
  ignoredMessageIds = new Set<string>(),
): Promise<string> {
  return waitForInboxMatch({
    inbox,
    ignoredMessageIds,
    description: "password reset token",
    extract: extractAccountActionToken,
  });
}

export async function waitForInboxDeletionToken(
  inbox: DisposableInbox,
  ignoredMessageIds = new Set<string>(),
  timeoutMs?: number,
): Promise<string> {
  return waitForInboxMatch({
    inbox,
    ignoredMessageIds,
    timeoutMs,
    description: "account deletion token",
    extract: extractAccountActionToken,
  });
}

export async function writeDisposableAccountMetadataAt(path: string, metadata: DisposableAccountMetadata): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

export async function writeDisposableAccountMetadata(metadata: DisposableAccountMetadata): Promise<void> {
  await writeDisposableAccountMetadataAt(disposableAccountMetadataPath, metadata);
}

export async function clearDisposableAccountMetadataAt(path: string): Promise<void> {
  await rm(path, { force: true });
}

export async function clearDisposableAccountMetadata(): Promise<void> {
  await clearDisposableAccountMetadataAt(disposableAccountMetadataPath);
}

export function readDisposableAccountMetadataAt(metadataPath: string): DisposableAccountMetadata | null {
  const path = resolve(process.cwd(), metadataPath);
  if (!existsSync(path)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }

  if (!isObject(parsed) || parsed.source !== "disposable-email-auth") return null;
  if (typeof parsed.email !== "string" || !isObject(parsed.inbox)) return null;
  const inbox = parsed.inbox;
  if (
    inbox.provider !== "guerrillamail" ||
    typeof inbox.email !== "string" ||
    typeof inbox.sidToken !== "string" ||
    typeof inbox.cookie !== "string"
  ) {
    return null;
  }

  return {
    source: "disposable-email-auth",
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
    email: parsed.email,
    inbox: {
      provider: "guerrillamail",
      email: inbox.email,
      sidToken: inbox.sidToken,
      cookie: inbox.cookie,
    },
    did: typeof parsed.did === "string" ? parsed.did : null,
    handle: typeof parsed.handle === "string" ? parsed.handle : null,
    serviceEndpoint: typeof parsed.serviceEndpoint === "string" ? parsed.serviceEndpoint : null,
  };
}

export function readDisposableAccountMetadata(): DisposableAccountMetadata | null {
  return readDisposableAccountMetadataAt(disposableAccountMetadataPath);
}
