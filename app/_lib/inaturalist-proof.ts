import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const INATURALIST_CONNECTION_COOKIE = "gf_inaturalist_connection";

export type INaturalistConnection = {
  ownerDid: string;
  userId: number;
  login: string;
  name: string | null;
  iconUrl: string | null;
  verifiedAt: number;
};

export type INaturalistPublicUser = {
  userId: number;
  login: string;
  name: string | null;
  iconUrl: string | null;
  verificationText: string;
};

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function encryptionKey(): Buffer {
  const secret =
    process.env.INATURALIST_PROOF_COOKIE_SECRET?.trim() ||
    process.env.AUTH_INTERNAL_SERVICE_TOKEN?.trim() ||
    "dev-inaturalist-proof-secret";
  return createHash("sha256").update(secret).digest();
}

export function sealJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function unsealJson<T>(value: string | undefined | null): T | null {
  if (!value) return null;
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as T;
  } catch {
    return null;
  }
}

export function verificationCodeForDid(did: string): string {
  return `gf=${did}`;
}

export function parseINaturalistUserInput(input: string): string | null {
  const trimmed = input.trim().replace(/^@/, "");
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "inaturalist.org") {
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts[0] === "people" || parts[0] === "users" ? parts[1] : parts[0];
      return marker && /^[a-z0-9_-]+$/i.test(marker) ? marker : null;
    }
  } catch {
    // Fall through to handle parsing.
  }
  return /^[a-z0-9_-]+$/i.test(trimmed) ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseINaturalistPublicUser(payload: unknown): INaturalistPublicUser | null {
  const root = isRecord(payload) ? payload : null;
  const candidate = Array.isArray(root?.results) ? root.results[0] : root?.user ?? root;
  if (!isRecord(candidate)) return null;
  const userId = numberValue(candidate.id);
  const login = stringValue(candidate.login) ?? stringValue(candidate.username);
  if (userId === null || !login) return null;
  const name = stringValue(candidate.name);
  const iconUrl = stringValue(candidate.icon_url) ?? stringValue(candidate.iconUrl) ?? stringValue(candidate.icon);
  const publicFields = [
    stringValue(candidate.description),
    stringValue(candidate.bio),
    stringValue(candidate.about),
    stringValue(candidate.profile),
  ].filter((value): value is string => Boolean(value));
  return {
    userId,
    login,
    name,
    iconUrl,
    verificationText: publicFields.join("\n").toLowerCase(),
  };
}

export async function fetchINaturalistPublicUser(handleOrUrl: string): Promise<INaturalistPublicUser> {
  const handle = parseINaturalistUserInput(handleOrUrl);
  if (!handle) throw new Error("Enter an iNaturalist handle or profile link.");
  const response = await fetch(`https://api.inaturalist.org/v1/users/${encodeURIComponent(handle)}`, {
    headers: { accept: "application/json", "user-agent": "GainForest iNaturalist profile proof" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  const user = parseINaturalistPublicUser(payload);
  if (!response.ok || !user) throw new Error("Could not find that iNaturalist account.");
  return user;
}
