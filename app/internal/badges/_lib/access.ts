import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchCgsMembersForRequest, type CgsServerRole } from "@/app/_lib/cgs-server";
import { resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import type { AuthSession } from "@/app/_lib/auth";

export type InternalBadgeAccess = {
  isLoggedIn: boolean;
  allowed: boolean;
  configured: boolean;
  session: AuthSession;
  repoDid: string | null;
  writeRepo: string | null;
  role: CgsServerRole | null;
};

const GAINFOREST_CGS_ACCOUNT_ENV = "NEXT_PUBLIC_GAINFOREST_CGS_ACCOUNT";
const PRIVILEGED_ROLES = new Set<CgsServerRole>(["owner", "admin"]);

function gainForestCgsAccountIdentifier(): string | null {
  const value = process.env[GAINFOREST_CGS_ACCOUNT_ENV]?.trim().replace(/^@+/, "") ?? "";
  return value || null;
}

export async function resolveInternalBadgeRepoDid(): Promise<string | null> {
  const configured = gainForestCgsAccountIdentifier();
  if (!configured) return null;
  if (configured.startsWith("did:")) return configured;
  return resolveIdentifierToDid(configured).catch(() => null);
}

async function getSessionRoleForGainForestOrg(session: AuthSession, repo: string): Promise<CgsServerRole | null> {
  if (!session.isLoggedIn) return null;
  const result = await fetchCgsMembersForRequest(repo).catch(() => null);
  const member = result?.members.find((entry) => entry.did === session.did);
  return member?.role ?? null;
}

export async function getInternalBadgeAccess(): Promise<InternalBadgeAccess> {
  const session = await fetchAuthSession();
  const configuredRepo = gainForestCgsAccountIdentifier();
  const configured = Boolean(configuredRepo);

  const repoDid = configuredRepo ? await resolveInternalBadgeRepoDid() : null;
  const role = repoDid ? await getSessionRoleForGainForestOrg(session, repoDid) : null;
  const allowed = Boolean(repoDid && role && PRIVILEGED_ROLES.has(role));

  return {
    isLoggedIn: session.isLoggedIn,
    allowed,
    configured,
    session,
    repoDid,
    writeRepo: allowed ? repoDid : null,
    role,
  };
}
