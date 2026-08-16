import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AudioMothClient } from "@/app/audiomoth/_components/AudioMothClient";
import { PictureHero } from "@/app/_components/PictureHero";
import { listNetworkAudioProjects } from "@/app/_lib/audio-projects";
import { listNetworkSoundscapes } from "@/app/_lib/soundscape-explore";
import { ObservationsMediaTabs } from "../_components/ObservationsMediaTabs";
import { AudioScopePills } from "./_components/AudioScopePills";
import { SoundscapeExploreGallery } from "./_components/SoundscapeExploreGallery";

export const dynamic = "force-dynamic";

/** The personal recording workflow tabs hosted by AudioMothClient. Without a
 *  `?tab=` the page shows the network-wide soundscape gallery instead —
 *  finished, listenable portraits rather than raw WAV files. */
const WORKFLOW_TABS = new Set([
  "library",
  "deployments",
  "upload",
  "label",
  "identifications",
  "soundscape",
  "setup",
]);

/**
 * Audio tab of the Observations hub. The default view is a gallery of every
 * soundscape published on GainForest — visitors browsing the network care
 * about the finished 24-hour portraits, not individual unlabeled recordings.
 * The personal recording workflow — library, deployments, SD-card upload,
 * labelling, identifications, the soundscape workbench and USB device setup
 * — lives behind `?tab=…`, reached from the hero's "Your recordings" pill
 * (its twin, "Public", leads back here).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.audiomoth.audioHub");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/observations/audio" },
  };
}

export default async function ObservationsAudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : undefined;

  if (tab && WORKFLOW_TABS.has(tab)) {
    const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));

    return (
      <main className="-mt-14 bg-background pb-20 md:pb-28">
        <AudioMothClient
          sessionDid={session.isLoggedIn ? session.did : null}
          mediaTabs={<ObservationsMediaTabs active="audio" />}
        />
      </main>
    );
  }

  const [t, soundscapes, uploadedProjects] = await Promise.all([
    getTranslations("common.audiomoth.audioHub"),
    listNetworkSoundscapes().catch(() => []),
    listNetworkAudioProjects().catch(() => []),
  ]);

  return (
    <main className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        compact
        lightSrc="/images/explore/explore-hero-light@2x.webp"
        darkSrc="/images/explore/explore-hero-dark@2x.webp"
        title={t("soundscapesTitle")}
        lede={t("soundscapesLede")}
        actions={<AudioScopePills active="public" />}
      />
      <div className="relative z-10 mx-auto mt-6 max-w-6xl px-6">
        <ObservationsMediaTabs active="audio" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <SoundscapeExploreGallery items={soundscapes} audioProjects={uploadedProjects} />
      </div>
    </main>
  );
}
