import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "../_lib/auth-server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { AudioMothClient } from "./_components/AudioMothClient";
import { isAudioMothUploadTrayFlagEnabled } from "@/app/_lib/audiomoth/feature-flags";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.audiomoth.meta");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/audiomoth" },
  };
}

export default async function AudioMothPage() {
  const [session, moderator] = await Promise.all([
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    // The soundscape tab is still being iterated on, so it stays limited to
    // members of the GainForest admin group — the same gate /admin uses.
    getGainForestModeratorAccess().catch(() => null),
  ]);

  return (
    <main className="-mt-14 bg-background pb-20">
      <AudioMothClient
        sessionDid={session.isLoggedIn ? session.did : null}
        useUploadTray={isAudioMothUploadTrayFlagEnabled()}
        canSeeSoundscape={moderator?.isModerator ?? false}
      />
    </main>
  );
}
