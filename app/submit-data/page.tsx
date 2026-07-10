import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArchiveIcon, CloudUploadIcon, SearchCheckIcon, SproutIcon } from "lucide-react";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { fetchAuthSession } from "../_lib/auth-server";
import { isDataJobsConfigured } from "../_lib/data-jobs";
import { SubmitDataClient } from "./_components/SubmitDataClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.dataJobs.meta");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: localizedAlternates("/submit-data"),
    ...socialPreviewMetadata("/submit-data", title, description),
  };
}

/**
 * Field-partner batch submissions: very large archives (photos + KoboToolbox
 * exports, up to 10GB) go straight from the browser to object storage as a
 * "job"; the GainForest team reviews each batch remotely and — with the
 * submitter's consent — publishes the observations to their account.
 */
export default async function SubmitDataPage() {
  const [t, session] = await Promise.all([
    getTranslations("common.dataJobs"),
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
  ]);

  const steps = [
    { Icon: ArchiveIcon, title: t("hero.step1Title"), description: t("hero.step1Description") },
    { Icon: CloudUploadIcon, title: t("hero.step2Title"), description: t("hero.step2Description") },
    { Icon: SearchCheckIcon, title: t("hero.step3Title"), description: t("hero.step3Description") },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8 md:pt-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-14">
        <section className="max-w-xl">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary shadow-inner">
              <SproutIcon className="size-4.5" />
            </span>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {t("hero.kicker")}
            </p>
          </div>
          <h1 className="mt-4 font-instrument text-4xl font-light italic tracking-[-0.04em] text-foreground">
            {t("hero.title")}
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{t("hero.description")}</p>

          <ol className="mt-8 space-y-5">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground">
                  <step.Icon className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{step.title}</h2>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <SubmitDataClient
          signedIn={session.isLoggedIn}
          configured={isDataJobsConfigured()}
        />
      </div>
    </main>
  );
}
