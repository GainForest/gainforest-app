import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "../_lib/auth-server";
import { AudioMothClient } from "./_components/AudioMothClient";

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

  return (
    <main className="-mt-14 bg-background pb-20">
      <AudioMothClient sessionDid={session.isLoggedIn ? session.did : null} />
    </main>
  );
}
