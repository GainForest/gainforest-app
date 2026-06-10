import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BrowseGrid } from "./_components/BrowseGrid";
import { HomeLanding } from "./_components/HomeLanding";
import { fetchKpis } from "./_lib/kpis";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "GainForest — Fund Regenerative Impact",
  description:
    "GainForest connects funders with nature stewards doing on-ground regenerative work. Support verified environmental impact directly.",
  alternates: { canonical: "/" },
};

const fetchHomeKpis = unstable_cache(fetchKpis, ["home-page-kpis"], {
  revalidate: 60 * 15,
});

// HomePage stays synchronous so the home segment never suspends at the route
// level — that lets us drop the catch-all app/loading.tsx (which used to shadow
// every section's tailored loading.tsx as the outermost Suspense boundary). The
// kpis fetch is wrapped in its own Suspense with a home-shaped fallback instead.
export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const kpis = await fetchHomeKpis();

  return (
    <>
      <HomeLanding kpis={kpis} />
      <BrowseGrid kpis={kpis} />
    </>
  );
}

function HomeFallback() {
  return (
    <>
      <section className="px-6 pt-16 pb-12 sm:px-12">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="h-16 w-full max-w-2xl" />
          <Skeleton className="h-5 w-full max-w-xl rounded-full" />
          <Skeleton className="h-5 w-2/3 max-w-md rounded-full" />
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton className="h-11 w-44 rounded-full" />
            <Skeleton className="h-11 w-44 rounded-full" />
          </div>
        </div>
      </section>
      <BrowseGridFallback />
    </>
  );
}

function BrowseGridFallback() {
  return (
    <section className="bg-background px-6 pt-10 pb-14 sm:px-12 sm:pt-12 md:px-6 md:pt-10 md:pb-16" aria-label="Explore links loading">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center md:mb-8">
          <h2 className="font-garamond text-4xl font-light tracking-[-0.01em] text-foreground md:text-5xl">Ways to Explore</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Four ways into GainForest work, shaped for funders, stewards, and field teams.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="min-h-[230px] rounded-2xl border border-border bg-card p-6 shadow-lg shadow-foreground/5">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="mt-5 h-9 w-40 rounded-full" />
              <Skeleton className="mt-4 h-3 w-full rounded-full" />
              <Skeleton className="mt-2 h-3 w-2/3 rounded-full" />
              <Skeleton className="mt-10 h-20 rounded-3xl" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
