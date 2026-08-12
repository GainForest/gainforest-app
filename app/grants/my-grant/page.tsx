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
 * organizations enrolled in one of the program's ten slots and to their
 * members — a member sees the organization's grant, named in the header so
 * it is clear whose it is. GainForest admins can preview. The sidebar entry
 * mirrors this, but this server-side check is what actually enforces it.
 *
 * Milestone states are read-only here: GainForest confirms milestones from
 * the admin panel, and this page shows the state of the grant the viewer
 * belongs to. Grant documents stay private to the admin group for now, so
 * they are not surfaced on this page at all.
 */
export default async function MyGrantPage() {
  const access = await getRewildingDashboardAccess();
  if (!access.allowed) {
    notFound();
  }

  const [fetched, recorders] = await Promise.all([
    fetchGrantOverview(access.grantDid),
    fetchRecorders(),
  ]);
  // Name the organization when the viewer reached this grant as a member.
  const overview = access.grantLabel ? { ...fetched, granteeLabel: access.grantLabel } : fetched;

  return (
    <RewildingPageShell isAdminPreview={access.isAdminPreview}>
      <MyGrantPageClient overview={overview} recorders={recorders} />
    </RewildingPageShell>
  );
}
