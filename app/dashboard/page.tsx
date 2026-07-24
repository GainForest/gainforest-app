import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { PictureHero } from "../_components/PictureHero";
import { DashboardLoadingView } from "./DashboardLoadingView";
import { StatsDashboardClient } from "./StatsDashboardClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.coreDashboard.metadata");
  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/dashboard"),
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
  };
}

export default async function DashboardPage() {
  const t = await getTranslations("common.coreDashboard");

  return (
    <section className="-mt-14 bg-background">
      <PictureHero
        lightSrc="/images/explore/explore-hero-light@2x.webp"
        darkSrc="/images/explore/explore-hero-dark@2x.webp"
        imageAlt={t("hero.imageAlt")}
        title={t("hero.title")}
        accent={t("hero.accent")}
        lede={t("hero.lede")}
      />
      <div className="relative z-10 -mt-8">
        <Suspense fallback={<DashboardLoadingView />}>
          <StatsDashboardClient />
        </Suspense>
      </div>
    </section>
  );
}
