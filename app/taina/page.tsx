import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BinocularsIcon, BotIcon, SendIcon, SproutIcon } from "lucide-react";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { fetchAuthSession } from "../_lib/auth-server";
import { TainaPageSkeleton } from "../_components/PageLoadingSkeletons";
import { TainaSetupClient } from "./_components/TainaSetupClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.taina.meta");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: localizedAlternates("/taina"),
    ...socialPreviewMetadata("/taina", title, description),
  };
}

export default function TainaPage() {
  return (
    <Suspense fallback={<TainaPageSkeleton />}>
      <TainaContent />
    </Suspense>
  );
}

async function TainaContent() {
  const [t, session] = await Promise.all([
    getTranslations("common.taina"),
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
  ]);

  const steps = [
    {
      Icon: BotIcon,
      title: t("hero.step1Title"),
      description: t("hero.step1Description"),
    },
    {
      Icon: SendIcon,
      title: t("hero.step2Title"),
      description: t("hero.step2Description"),
    },
    {
      Icon: BinocularsIcon,
      title: t("hero.step3Title"),
      description: t("hero.step3Description"),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8 md:pt-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
        {/* Intro + how it works */}
        <section className="max-w-xl">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary shadow-inner">
              <SproutIcon className="size-4.5" />
            </span>
            <span className="font-instrument text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("hero.eyebrow")}
            </span>
          </div>

          <h1 className="mt-5 font-garamond text-4xl font-normal leading-[1.06] tracking-[-0.015em] text-foreground sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-foreground/80 md:text-lg md:leading-8">
            {t("hero.description")}
          </p>

          <div className="mt-5 max-w-lg rounded-2xl bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
            {t("hero.storageNote")}
          </div>

          <ol className="mt-8 space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-4">
                <span className="relative mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/10 bg-primary/10 text-primary shadow-inner">
                  <step.Icon className="size-5" />
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary font-instrument text-[11px] text-primary-foreground">
                    {index + 1}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Setup card */}
        <section className="lg:pt-2">
          <TainaSetupClient
            signedIn={session.isLoggedIn}
            handle={session.isLoggedIn ? session.handle : null}
            did={session.isLoggedIn ? session.did : null}
          />
        </section>
      </div>
    </main>
  );
}
