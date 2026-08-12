import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchGrantOverview, fetchRecorders } from "../_lib/rewilding-grant";
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
 * Milestone states are read-only here: GainForest confirms milestones from
 * the admin panel's "Rewilding the Web" section, and this page shows the
 * signed-in viewer their own grant's state. Grant documents stay private to
 * the admin group for now, so they are not surfaced on this page at all.
 */
export default async function MyGrantPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const viewerDid = moderator.session.isLoggedIn ? moderator.session.did : null;
  const [overview, recorders] = await Promise.all([fetchGrantOverview(viewerDid), fetchRecorders()]);

  return (
    <RewildingPageShell>
      <MyGrantPageClient overview={overview} recorders={recorders} />
    </RewildingPageShell>
  );
}
