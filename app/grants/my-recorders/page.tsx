import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getRewildingDashboardAccess } from "../_lib/rewilding-access";
import { fetchRecorders } from "../_lib/rewilding-grant";
import { MyRecordersView } from "../_components/rewilding/MyRecordersView";
import { RewildingPageShell } from "../_components/rewilding/RewildingPageShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.grants.rewildingDashboard.recorders.metadata");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

/**
 * "My recorders" — the grantee's device inventory, gated like the grant
 * overview: enrolled grantees plus GainForest admins as a preview.
 *
 * Adding a recorder renders greyed out: there is no record type to write a
 * recorder to yet, so a working Save button would silently discard what the
 * user typed. The affordance still shows — with `addDisabledNote` saying the
 * feature is not built — so the page reads as unfinished rather than as if
 * the button were missing. Pass an `onAddRecorder` writer once persistence
 * lands and it enables itself; `AddRecorderForm` is already wired to it.
 */
export default async function MyRecordersPage() {
  const access = await getRewildingDashboardAccess();
  if (!access.allowed) {
    notFound();
  }

  const t = await getTranslations("marketplace.grants.rewildingDashboard.recorders");
  const recorders = await fetchRecorders();

  return (
    <RewildingPageShell isAdminPreview={access.isAdminPreview}>
      <MyRecordersView recorders={recorders} canAddRecorders addDisabledNote={t("addNotBuilt")} />
    </RewildingPageShell>
  );
}
