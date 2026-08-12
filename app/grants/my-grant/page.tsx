import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchGrantDocuments, fetchGrantOverview, fetchRecorders } from "../_lib/rewilding-grant";
import { MyGrantPageClient } from "../_components/rewilding/MyGrantPageClient";
import { RewildingPageShell } from "../_components/rewilding/RewildingPageShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.grants.rewildingDashboard.grant.metadata");
  return {
    title: t("title"),
    description: t("description"),
    // Unreleased and admin-gated: keep it out of search results entirely.
    robots: { index: false, follow: false },
  };
}

/**
 * "My grant" — the Rewilding the Web grantee's overview. Gated to GainForest
 * admin-group members while the dashboard is unreleased; the sidebar entry is
 * hidden for everyone else, but this server-side check is what actually
 * enforces it.
 *
 * Milestone states and grant documents are read-only here: GainForest
 * confirms milestones and uploads documents from the admin panel's
 * "Rewilding the Web" section, and this page shows the signed-in viewer
 * their own grant's state.
 */
export default async function MyGrantPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const viewerDid = moderator.session.isLoggedIn ? moderator.session.did : null;
  const [overview, recorders, documents] = await Promise.all([
    fetchGrantOverview(viewerDid),
    fetchRecorders(),
    fetchGrantDocuments(viewerDid),
  ]);

  return (
    <RewildingPageShell>
      <MyGrantPageClient overview={overview} recorders={recorders} documents={documents} />
    </RewildingPageShell>
  );
}
