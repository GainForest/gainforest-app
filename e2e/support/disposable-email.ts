import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const disposableAccountMetadataPath = "e2e/.auth/disposable-account.json";
export const memberDisposableAccountMetadataPath = "e2e/.auth/member-account.json";

type DisposableEmailMessage = {
  id: string;
  subject: string;
};

type GuerrillaInbox = {
  provider: "guerrillamail";
  email: string;
  sidToken: string;
  cookie: string;
};

type MailTmInbox = {
  provider: "mailtm";
  email: string;
  password: string;
  token: string;
};

export type DisposableInbox = GuerrillaInbox | MailTmInbox;

export type DisposableAccountMetadata = {
  source: "disposable-email-auth";
  createdAt: string;
  email: string;
  inbox: DisposableInbox;
  did: string | null;
  handle: string | null;
  serviceEndpoint: string | null;
  /** Persisted by teardown so interrupted cleanup can be retried manually. */
  password?: string | null;
  passwordResetToken?: string | null;
  deletionToken?: string | null;
  deletedAt?: string | null;
  verifiedGoneAt?: string | null;
  cleanupError?: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function randomUserPart(): string {
  const configured = process.env.E2E_DISPOSABLE_EMAIL_PREFIX?.trim() || "gf-e2e";
  const suffix = Math.random().toString(36).slice(2, 13);
  return `${configured.replace(/[^a-z0-9]/gi, "").toLowerCase()}${suffix}`.slice(0, 32);
}

function makeMailboxPassword(): string {
  return `Mailbox-${Date.now()}-${Math.random().toString(36).slice(2)}-Aa1!`;
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

async function mailTmJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`https://api.mail.tm${path}`, init);
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const detail = isObject(body) && typeof body.detail === "string" ? body.detail : response.statusText;
    throw new Error(`Mail.tm request failed: ${response.status} ${detail}`);
  }
  return body;
}

async function createGuerrillaInbox(): Promise<GuerrillaInbox> {
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

async function createMailTmInbox(): Promise<MailTmInbox> {
  const domains = await mailTmJson("/domains");
  const entries = isObject(domains) && Array.isArray(domains["hydra:member"]) ? domains["hydra:member"] : [];
  const domain = entries.find((entry) => isObject(entry) && entry.isActive === true && entry.isPrivate !== true);
  const domainName = isObject(domain) && typeof domain.domain === "string" ? domain.domain : null;
  if (!domainName) throw new Error("Mail.tm did not return an active public domain.");

  const email = `${randomUserPart()}@${domainName}`;
  const password = makeMailboxPassword();
  await mailTmJson("/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  });
  const tokenBody = await mailTmJson("/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  });
  if (!isObject(tokenBody) || typeof tokenBody.token !== "string") {
    throw new Error("Mail.tm did not return an inbox token.");
  }
  return { provider: "mailtm", email, password, token: tokenBody.token };
}

export async function createDisposableInbox(): Promise<DisposableInbox> {
  const provider = process.env.E2E_DISPOSABLE_EMAIL_PROVIDER?.trim().toLowerCase() || "mailtm";
  if (provider === "guerrillamail") return createGuerrillaInbox();
  return createMailTmInbox();
}

export async function listDisposableEmailMessages(inbox: DisposableInbox): Promise<DisposableEmailMessage[]> {
  if (inbox.provider === "mailtm") {
    const value = await mailTmJson("/messages", { headers: { authorization: `Bearer ${inbox.token}` } });
    const entries = isObject(value) && Array.isArray(value["hydra:member"]) ? value["hydra:member"] : [];
    return entries
      .filter((entry): entry is Record<string, unknown> => isObject(entry))
      .map((entry) => ({ id: String(entry.id ?? ""), subject: typeof entry.subject === "string" ? entry.subject : "" }))
      .filter((entry) => entry.id.length > 0);
  }

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
  if (inbox.provider === "mailtm") {
    const value = await mailTmJson(`/messages/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${inbox.token}` } });
    if (!isObject(value)) return "";
    const subject = typeof value.subject === "string" ? value.subject : "";
    const html = Array.isArray(value.html) ? value.html.join(" ") : "";
    const text = typeof value.text === "string" ? value.text : "";
    return `${subject}\n${stripHtml(html || text)}`;
  }

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
  return waitForInboxMatch({ inbox, ignoredMessageIds, description: "disposable inbox code", extract: extractOtp });
}

export async function waitForInboxPasswordResetToken(
  inbox: DisposableInbox,
  ignoredMessageIds = new Set<string>(),
): Promise<string> {
  return waitForInboxMatch({ inbox, ignoredMessageIds, description: "password reset token", extract: extractAccountActionToken });
}

export async function waitForInboxDeletionToken(
  inbox: DisposableInbox,
  ignoredMessageIds = new Set<string>(),
  timeoutMs?: number,
): Promise<string> {
  return waitForInboxMatch({ inbox, ignoredMessageIds, timeoutMs, description: "account deletion token", extract: extractAccountActionToken });
}

export async function writeDisposableAccountMetadataAt(path: string, metadata: DisposableAccountMetadata): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function parseInbox(value: unknown): DisposableInbox | null {
  if (!isObject(value) || typeof value.email !== "string") return null;
  if (value.provider === "mailtm" && typeof value.password === "string" && typeof value.token === "string") {
    return { provider: "mailtm", email: value.email, password: value.password, token: value.token };
  }
  if (value.provider === "guerrillamail" && typeof value.sidToken === "string" && typeof value.cookie === "string") {
    return { provider: "guerrillamail", email: value.email, sidToken: value.sidToken, cookie: value.cookie };
  }
  return null;
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
  if (typeof parsed.email !== "string") return null;
  const inbox = parseInbox(parsed.inbox);
  if (!inbox) return null;

  return {
    source: "disposable-email-auth",
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
    email: parsed.email,
    inbox,
    did: typeof parsed.did === "string" ? parsed.did : null,
    handle: typeof parsed.handle === "string" ? parsed.handle : null,
    serviceEndpoint: typeof parsed.serviceEndpoint === "string" ? parsed.serviceEndpoint : null,
    password: typeof parsed.password === "string" ? parsed.password : null,
    passwordResetToken: typeof parsed.passwordResetToken === "string" ? parsed.passwordResetToken : null,
    deletionToken: typeof parsed.deletionToken === "string" ? parsed.deletionToken : null,
    deletedAt: typeof parsed.deletedAt === "string" ? parsed.deletedAt : null,
    verifiedGoneAt: typeof parsed.verifiedGoneAt === "string" ? parsed.verifiedGoneAt : null,
    cleanupError: typeof parsed.cleanupError === "string" ? parsed.cleanupError : null,
  };
}

export function readDisposableAccountMetadata(): DisposableAccountMetadata | null {
  return readDisposableAccountMetadataAt(disposableAccountMetadataPath);
}
