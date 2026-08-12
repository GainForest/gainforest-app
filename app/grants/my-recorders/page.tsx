import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
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
 * "My recorders" — the grantee's device inventory, admin-gated like the grant
 * overview.
 *
 * Adding a recorder is deliberately switched off: there is no record type to
 * write a recorder to yet, so offering a Save button would silently discard
 * what the user typed. `addUnavailableNote` explains that in plain language
 * instead. Flip `canAddRecorders` on (from the viewer's role) and pass an
 * `onAddRecorder` writer once persistence lands — `AddRecorderForm` is already
 * wired to it.
 */
export default async function MyRecordersPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const t = await getTranslations("marketplace.grants.rewildingDashboard.recorders");
  const recorders = await fetchRecorders();

  return (
    <RewildingPageShell>
      <MyRecordersView recorders={recorders} canAddRecorders={false} addUnavailableNote={t("addComingSoon")} />
    </RewildingPageShell>
  );
}
