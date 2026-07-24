import type { Metadata } from "next";
import { InfoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SoundscapeClient } from "./_components/SoundscapeClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.soundscape.meta");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/soundscape" },
  };
}

export default async function SoundscapePage() {
  const t = await getTranslations("common.soundscape");

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-8 pt-4 sm:px-5 sm:pt-6 lg:px-8">
      <header className="max-w-2xl space-y-4">
        <h1 className="font-instrument text-4xl italic leading-[1.06] tracking-[-0.015em] text-foreground sm:text-5xl">
          {t("hero.title")}
        </h1>
        <p className="text-base leading-7 text-foreground/80 md:text-lg md:leading-8">
          {t("hero.description")}
        </p>
        <p className="flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
          <InfoIcon className="mt-1 size-4 shrink-0" />
          <span>{t("hero.timeNote")}</span>
        </p>
      </header>

      <div className="mt-10">
        <SoundscapeClient />
      </div>
    </main>
  );
}
