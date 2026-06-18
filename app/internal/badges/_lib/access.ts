import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import type { AuthSession } from "@/app/_lib/auth";

export type InternalBadgeAccess = {
  isLoggedIn: boolean;
  allowed: boolean;
  configured: boolean;
  session: AuthSession;
  repoDid: string | null;
  writeRepo: string | null;
};

function splitEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function allowlistEntries(): string[] {
  return [
    ...splitEnv(process.env.INTERNAL_BADGE_DASHBOARD_ALLOWLIST),
    ...splitEnv(process.env.INTERNAL_DASHBOARD_ALLOWLIST),
    ...splitEnv(process.env.INTERNAL_BADGE_DASHBOARD_DIDS),
    ...splitEnv(process.env.INTERNAL_BADGE_DASHBOARD_HANDLES),
  ];
}

function isAllowlisted(session: AuthSession): boolean {
  if (!session.isLoggedIn) return false;
  const entries = allowlistEntries();
  if (entries.length === 0) return false;

  const did = session.did.trim();
  const handle = normalizeHandle(session.handle);
  return entries.some((entry) => {
    const normalized = normalizeHandle(entry);
    return normalized === did.toLowerCase() || normalized === handle;
  });
}

export async function resolveInternalBadgeRepoDid(session: AuthSession): Promise<string | null> {
  const configured = (process.env.INTERNAL_BADGE_REPO_DID || process.env.INTERNAL_BADGE_REPO || "").trim();
  if (!configured) return session.isLoggedIn ? session.did : null;
  if (configured.startsWith("did:")) return configured;
  return resolveIdentifierToDid(configured).catch(() => null);
}

export async function getInternalBadgeAccess(): Promise<InternalBadgeAccess> {
  const session = await fetchAuthSession();
  const configured = allowlistEntries().length > 0;
  const allowed = configured && isAllowlisted(session);
  const repoDid = allowed ? await resolveInternalBadgeRepoDid(session) : null;

  return {
    isLoggedIn: session.isLoggedIn,
    allowed: Boolean(allowed && repoDid),
    configured,
    session,
    repoDid,
    writeRepo: session.isLoggedIn && repoDid && repoDid !== session.did ? repoDid : null,
  };
}
