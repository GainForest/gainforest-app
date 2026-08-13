import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AudioMothClient } from "@/app/audiomoth/_components/AudioMothClient";
import { ObservationsMediaTabs } from "../_components/ObservationsMediaTabs";

export const dynamic = "force-dynamic";

/**
 * Audio tab of the Observations hub. Hosts the recording workflow that used
 * to live on the standalone AudioMoth page: deployments, SD-card upload,
 * labelling, identifications and the soundscape view. The USB device setup
 * tool lives next door on /observations/devices.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.audiomoth.audioHub");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/observations/audio" },
  };
}

export default async function ObservationsAudioPage() {
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));

  return (
    <main className="-mt-14 bg-background pb-20">
      <AudioMothClient
        surface="audio"
        sessionDid={session.isLoggedIn ? session.did : null}
        mediaTabs={<ObservationsMediaTabs active="audio" />}
      />
    </main>
  );
}
