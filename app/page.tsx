import type { Metadata } from "next";
import { Suspense } from "react";
import { BrowseGrid } from "./_components/BrowseGrid";
import { HomeLanding } from "./_components/HomeLanding";
import { fetchDevicesSummary } from "./_lib/devices";
import { fetchKpis } from "./_lib/kpis";
import { fetchStatus } from "./_lib/status";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Bumicerts — Fund Regenerative Impact",
  description:
    "Bumicerts connects funders with nature stewards doing on-ground regenerative work. Support checked environmental impact directly.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <HomeLanding />
      <Suspense fallback={<BrowseGridFallback />}>
        <HomeCollections />
      </Suspense>
    </>
  );
}

async function HomeCollections() {
  const [kpis, status, devices] = await Promise.all([
    fetchKpis(),
    fetchStatus({ revalidate: 60 }),
    fetchDevicesSummary(),
  ]);

  return <BrowseGrid kpis={kpis} status={status} devices={devices} />;
}

function BrowseGridFallback() {
  return (
    <section className="bg-background px-6 pt-4 pb-12 sm:px-12 md:px-6 md:pt-8 md:pb-16" aria-label="Collections loading">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center md:mb-8">
          <h2 className="font-garamond text-4xl font-light tracking-[-0.01em] text-foreground md:text-5xl">Collections</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Six live views into GainForest work, shaped for funders, stewards, and field teams.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="min-h-[230px] rounded-2xl border border-border bg-card p-6 shadow-lg shadow-foreground/5">
              <div className="h-6 w-28 rounded-full bg-muted" />
              <div className="mt-5 h-9 w-40 rounded-full bg-muted/80" />
              <div className="mt-4 h-3 w-full rounded-full bg-muted/70" />
              <div className="mt-2 h-3 w-2/3 rounded-full bg-muted/50" />
              <div className="mt-10 h-20 rounded-3xl bg-foreground/5" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
