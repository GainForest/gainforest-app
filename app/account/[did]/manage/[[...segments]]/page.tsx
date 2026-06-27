import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import {
  accountAddDataPath,
  accountAudioPath,
  accountBumicertsPath,
  accountDronePath,
  accountNewCertPath,
  accountObservationsPath,
  accountOrganizationsPath,
  accountPath,
  accountProjectCertsPath,
  accountProjectGalleryPath,
  accountProjectsPath,
  accountSettingsPath,
  accountSitesPath,
  accountTimelinePath,
  accountTreesPath,
} from "@/app/account/_lib/account-route";
import { ManageHomeSection } from "@/app/(manage)/manage/_sections";

export const metadata: Metadata = {
  title: "Manage — GainForest",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ did: string; segments?: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function safeDecode(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * Management now lives on the account profile (/account/<id> and its tabs). This
 * route keeps two things alive:
 *   1. Onboarding — the focused first-run setup flow.
 *   2. Deep editing tools that have no standalone profile tab: per-project
 *      gallery/cert editors, the cert minting wizard, and the add-data flow.
 * Every top-level section (home, projects, observations, certs, settings, the
 * org data tabs, organizations) redirects to its profile equivalent so the old
 * manage URLs, bookmarks, and the welcome email keep working.
 */
export default async function AccountManagePage({ params, searchParams }: PageProps) {
  const { did, segments = [] } = await params;
  const access = await resolveAccountManageAccess(safeDecode(did));
  // Access errors (signed-out / not-member / forbidden / not-found) are handled
  // by the manage layout, which renders the notice instead of these children.
  if (access.status !== "allowed") return null;
  const target = access.target;
  const id = target.identifier;

  const [first, second, third, ...rest] = segments;
  if (rest.length > 0) notFound();

  if (!first) {
    const sp = await searchParams;
    const mode = firstParam(sp.mode);
    const isOnboardingMode = mode === "onboard-user" || mode === "onboard-org";
    const hasCompletedSetup = access.account.summary.hasCertifiedProfile || access.account.summary.hasCertifiedOrg;
    // Brand-new accounts (and explicit onboarding requests, e.g. "create an
    // organization") still run the focused setup flow here; everyone else goes
    // to their profile, which is now the dashboard.
    if (isOnboardingMode || !hasCompletedSetup) {
      return <ManageHomeSection target={target} wrapDashboard={false} />;
    }
    redirect(accountPath(id));
  }

  // Deep editing tools now live directly on the profile; forward the legacy
  // /manage URLs (and preserve the cert wizard's query string).
  if (first === "add" && !second) redirect(accountAddDataPath(id));
  if (first === "projects" && second && third === "gallery") redirect(accountProjectGalleryPath(id, decodeURIComponent(second)));
  if (first === "projects" && second && third === "certs") redirect(accountProjectCertsPath(id, decodeURIComponent(second)));
  if (first === "certs" && second === "new") {
    const sp = await searchParams;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      const raw = Array.isArray(value) ? value[0] : value;
      if (typeof raw === "string" && raw.length > 0) query.set(key, raw);
    }
    const queryString = query.toString();
    redirect(queryString ? `${accountNewCertPath(id)}?${queryString}` : accountNewCertPath(id));
  }

  // Top-level sections → their profile tab.
  if (first === "projects" && !second) redirect(accountProjectsPath(id));
  if (first === "sites" && !second) redirect(accountSitesPath(id));
  if (first === "trees" && !second) redirect(accountTreesPath(id));
  if (first === "audio" && !second) redirect(accountAudioPath(id));
  if (first === "drone" && !second) redirect(accountDronePath(id));
  if (first === "certs" && !second) redirect(accountBumicertsPath(id));
  if (first === "bumicerts" && !second) redirect(accountBumicertsPath(id));
  if (first === "observations" && !second) redirect(accountObservationsPath(id));
  if (first === "settings" && !second) redirect(accountSettingsPath(id));
  if (first === "timeline" && !second) redirect(accountTimelinePath(id));
  if (first === "groups" && !second) redirect(accountOrganizationsPath(id));
  if (first === "organizations" && !second) {
    if (target.kind !== "personal") notFound();
    redirect(accountOrganizationsPath(id));
  }

  notFound();
}
