import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "../_lib/auth-server";
import { isAudioMothLabellingFlagEnabled } from "@/app/_lib/audiomoth/feature-flags";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import { IdentificationsClient } from "./_components/IdentificationsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.identifications.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/identifications" },
  };
}

export default async function IdentificationsPage() {
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));
  const moderator = session.isLoggedIn
    ? await getGainForestModeratorAccess().catch(() => null)
    : null;
  const canView = isAudioMothLabellingFlagEnabled() && Boolean(moderator?.isModerator);

  // Admin-only route: hide its existence from everyone else (the sidebar entry
  // is also gated, but the route must re-check server-side).
  if (!canView) notFound();

  const t = await getTranslations("common.identifications");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-12">
      <header className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <AdminOnlyIndicator />
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <IdentificationsClient sessionDid={session.isLoggedIn ? session.did : null} />
    </main>
  );
}
