import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AudioMothClient } from "@/app/audiomoth/_components/AudioMothClient";
import { ObservationsMediaTabs } from "../_components/ObservationsMediaTabs";

export const dynamic = "force-dynamic";

/**
 * Devices tab of the Observations hub: the browser-based AudioMoth setup
 * tool (clock, recording configuration, firmware) that used to be the
 * standalone AudioMoth page's Setup tab. Recording workflows live on the
 * Audio tab at /observations/audio.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.audiomoth.meta");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/observations/devices" },
  };
}

export default async function ObservationsDevicesPage() {
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));

  return (
    <main className="-mt-14 bg-background pb-20">
      <AudioMothClient
        surface="devices"
        sessionDid={session.isLoggedIn ? session.did : null}
        mediaTabs={<ObservationsMediaTabs active="devices" />}
      />
    </main>
  );
}
