import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isAudioMothLabellingFlagEnabled } from "@/app/_lib/audiomoth/feature-flags";

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
  const canView = isAudioMothLabellingFlagEnabled();

  // Release-flag gated only: hide the route when the feature is switched off.
  if (!canView) notFound();

  redirect("/audiomoth?tab=identifications");
}
