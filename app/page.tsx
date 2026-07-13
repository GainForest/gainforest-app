import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BrowseGrid } from "./_components/BrowseGrid";
import { HomeLanding } from "./_components/HomeLanding";
import { fetchAuthSession } from "./_lib/auth-server";
import { fetchKpis } from "./_lib/kpis";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.seo");

  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/"),
  };
}

const fetchHomeKpis = unstable_cache(fetchKpis, ["home-page-kpis"], {
  revalidate: 60 * 15,
});

// HomePage stays synchronous so the home segment never suspends at the route
// level — that lets us drop the catch-all app/loading.tsx (which used to shadow
// every section's tailored loading.tsx as the outermost Suspense boundary). The
// kpis fetch is wrapped in its own Suspense with a home-shaped fallback instead.
export default async function HomePage() {
  // Already signed in? Skip the marketing landing and go straight to the
  // activity feed — the app's logged-in home base. The locale prefix (e.g. /en)
  // is added by the proxy middleware.
  const session = await fetchAuthSession();
  if (session.isLoggedIn) {
    redirect("/feed");
  }

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
    <section className="bg-background px-6 pt-10 pb-14 sm:px-12 sm:pt-12 md:px-6 md:pt-10 md:pb-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col items-center md:mb-8">
          <Skeleton className="h-12 w-64 rounded-full" />
          <Skeleton className="mt-4 h-5 w-full max-w-xl rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
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
