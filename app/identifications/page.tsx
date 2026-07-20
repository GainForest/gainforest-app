import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "../_lib/auth-server";
import { isAudioMothLabellingFlagEnabled } from "@/app/_lib/audiomoth/feature-flags";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.identifications.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/audiomoth?tab=identifications" },
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

  redirect("/audiomoth?tab=identifications");
}
