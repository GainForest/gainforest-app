import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "../_lib/auth-server";
import { AudioMothClient } from "./_components/AudioMothClient";
import { isAudioMothLabellingFlagEnabled } from "@/app/_lib/audiomoth/feature-flags";

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
  const canUseLabelling = isAudioMothLabellingFlagEnabled();

  return (
    <main className="-mt-14 bg-background pb-20">
      <AudioMothClient
        sessionDid={session.isLoggedIn ? session.did : null}
        canUseLabelling={canUseLabelling}
      />
    </main>
  );
}
