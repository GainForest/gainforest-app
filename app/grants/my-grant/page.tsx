import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getRewildingDashboardAccess } from "../_lib/rewilding-access";
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
 * "My grant" — the Rewilding the Web grantee's overview. Open to the
 * organizations enrolled in one of the program's ten slots (that enrollment
 * is made in the admin panel's "Rewilding the Web" section); GainForest
 * admins can preview. The sidebar entry mirrors this, but this server-side
 * check is what actually enforces it.
 *
 * Milestone states are read-only here: GainForest confirms milestones from
 * the admin panel, and this page shows the signed-in viewer their own
 * grant's state. Grant documents stay private to the admin group for now,
 * so they are not surfaced on this page at all.
 */
export default async function MyGrantPage() {
  const access = await getRewildingDashboardAccess();
  if (!access.allowed) {
    notFound();
  }

  const [overview, recorders] = await Promise.all([
    fetchGrantOverview(access.viewerDid),
    fetchRecorders(),
  ]);

  return (
    <RewildingPageShell isAdminPreview={access.isAdminPreview}>
      <MyGrantPageClient overview={overview} recorders={recorders} />
    </RewildingPageShell>
  );
}
