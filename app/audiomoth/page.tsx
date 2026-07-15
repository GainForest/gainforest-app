import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "../_lib/auth-server";
import { AudioMothClient } from "./_components/AudioMothClient";
import { isAudioMothLabellingFlagEnabled } from "@/app/_lib/audiomoth/feature-flags";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";

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
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));
  const moderator = session.isLoggedIn
    ? await getGainForestModeratorAccess().catch(() => null)
    : null;
  const canUseLabelling = isAudioMothLabellingFlagEnabled() && Boolean(moderator?.isModerator);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 md:pt-12">
      <AudioMothClient
        sessionDid={session.isLoggedIn ? session.did : null}
        canUseLabelling={canUseLabelling}
      />
    </main>
  );
}
