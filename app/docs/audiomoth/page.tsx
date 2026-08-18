import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { AudioMothGuide } from "./_components/AudioMothGuide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audiomothGuide.meta");

  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/docs/audiomoth"),
  };
}

export default function AudioMothGuidePage() {
  return <AudioMothGuide />;
}
