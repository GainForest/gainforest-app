import type { Metadata } from "next";
import { Suspense } from "react";
import { LayoutDashboardIcon } from "lucide-react";
import { PictureHero } from "../_components/PictureHero";
import { DashboardStatsPageSkeleton } from "../_components/PageLoadingSkeletons";
import { StatsDashboardClient } from "./StatsDashboardClient";

export const metadata: Metadata = {
  title: "Dashboard — GainForest",
  description: "Internal overview of GainForest marketplace totals.",
  alternates: { canonical: "/dashboard" },
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

export default function DashboardPage() {
  return (
    <section className="-mt-14 bg-background">
      <PictureHero
        lightSrc="/images/explore/explore-hero-light@2x.webp"
        darkSrc="/images/explore/explore-hero-dark@2x.webp"
        eyebrow="Dashboard"
        icon={<LayoutDashboardIcon />}
        title="Platform"
        accent="overview"
        lede="A single place for the totals from project stories, organizations, observations, and projects."
      />
      <div className="relative z-10 -mt-8">
        <Suspense fallback={<DashboardStatsPageSkeleton />}>
          <StatsDashboardClient />
        </Suspense>
      </div>
    </section>
  );
}
