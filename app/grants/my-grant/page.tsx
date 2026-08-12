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
 * admin-group members while the dashboard is unreleased and still rendering
 * placeholder data; the sidebar entry is hidden for everyone else, but this
 * server-side check is what actually enforces it.
 */
export default async function MyGrantPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const t = await getTranslations("marketplace.grants.rewildingDashboard.grant.milestones");
  const [overview, recorders] = await Promise.all([fetchGrantOverview(), fetchRecorders()]);

  return (
    <RewildingPageShell>
      {/* Check-off is greyed out, not hidden: there is nowhere to persist a
          claim yet, and a working button that forgets on reload would be worse
          than one that says so. */}
      <MyGrantPageClient
        overview={overview}
        recorders={recorders}
        markMilestoneDisabledNote={t("markNotBuilt")}
      />
    </RewildingPageShell>
  );
}
