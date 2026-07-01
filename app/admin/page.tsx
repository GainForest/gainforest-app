import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheckIcon } from "lucide-react";
import Container from "@/components/ui/container";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchFlaggedTestAccounts } from "@/app/internal/badges/_lib/test-accounts";
import { fetchGrantApplicants } from "@/app/_lib/grants";
import { fetchBioblitzRegistrants } from "@/app/_lib/bioblitz";
import { fetchTainaAdminResidents } from "@/app/_lib/taina-agent";
import { fetchIndexedCertifiedProfileCards } from "@/app/_lib/indexer";
import { BUILTIN_ENDORSERS, fetchEndorserRecords } from "@/app/_lib/endorsers";
import { AdminModerationDashboard, type AdminTab } from "./_components/AdminModerationDashboard";
import type { AdminTainaRow } from "./_components/AdminTainaPanel";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const TABS: AdminTab[] = ["taina", "grants", "bioblitz", "testAccounts", "endorsers"];

/**
 * The Tainá roster for the admin panel: runtime data (bot, last used, credit
 * spend) enriched with each owner's display name + avatar. `null` signals the
 * runtime is unreachable — distinct from "nobody has a Tainá yet".
 */
async function loadTainaRows(): Promise<{ rows: AdminTainaRow[]; allowanceUsd: number } | null> {
  try {
    const { residents, allowanceUsd } = await fetchTainaAdminResidents();
    const cards = await fetchIndexedCertifiedProfileCards(residents.map((r) => r.did)).catch(
      () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
    );
    const rows = residents
      .map((resident) => ({
        ...resident,
        displayName: cards.get(resident.did)?.displayName ?? null,
        avatarUrl: cards.get(resident.did)?.avatarUrl ?? null,
      }))
      // Most recently active first; never-used agents sink to the bottom.
      .sort((a, b) =>
        (b.lastUsedAt ?? b.provisionedAt).localeCompare(a.lastUsedAt ?? a.provisionedAt),
      );
    return { rows, allowanceUsd };
  } catch {
    return null;
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Standalone moderation panel, gated to members of the admin group (any role).
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const t = await getTranslations("common.adminModeration");
  const [{ tab }, testAccounts, grantApplicants, bioblitzRegistrants, taina, endorsers] = await Promise.all([
    searchParams,
    fetchFlaggedTestAccounts().catch(() => []),
    fetchGrantApplicants().catch(() => []),
    fetchBioblitzRegistrants().catch(() => []),
    loadTainaRows(),
    moderator.repoDid ? fetchEndorserRecords(moderator.repoDid).catch(() => []) : Promise.resolve([]),
  ]);

  const initialTab: AdminTab = TABS.includes(tab as AdminTab) ? (tab as AdminTab) : "taina";

  return (
    <Container className="pt-4 pb-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5 text-muted-foreground" />
          <h1 className="font-instrument text-3xl font-light italic tracking-[-0.04em]">{t("page.title")}</h1>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{t("page.subtitle")}</p>
      </header>
      <AdminModerationDashboard
        initialTab={initialTab}
        testAccounts={testAccounts}
        grantApplicants={grantApplicants}
        bioblitzRegistrants={bioblitzRegistrants}
        tainaRows={taina?.rows ?? null}
        tainaAllowanceUsd={taina?.allowanceUsd ?? 25}
        builtinEndorsers={BUILTIN_ENDORSERS}
        endorsers={endorsers}
      />
    </Container>
  );
}
