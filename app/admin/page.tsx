import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheckIcon } from "lucide-react";
import Container from "@/components/ui/container";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchFlaggedTestAccounts } from "@/app/internal/badges/_lib/test-accounts";
import { fetchGrantApplicants } from "@/app/_lib/grants";
import { fetchBioblitzRegistrants } from "@/app/_lib/bioblitz";
import { AdminModerationDashboard } from "./_components/AdminModerationDashboard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  // Standalone moderation panel, gated to members of the admin group (any role).
  // It's no longer tucked inside a profile — it's just the panel itself.
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const t = await getTranslations("common.adminModeration");
  const [testAccounts, grantApplicants, bioblitzRegistrants] = await Promise.all([
    fetchFlaggedTestAccounts().catch(() => []),
    fetchGrantApplicants().catch(() => []),
    fetchBioblitzRegistrants().catch(() => []),
  ]);

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
        testAccounts={testAccounts}
        grantApplicants={grantApplicants}
        bioblitzRegistrants={bioblitzRegistrants}
      />
    </Container>
  );
}
