import { Skeleton } from "@/components/ui/skeleton";

function PageShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main className={`min-h-dvh bg-background pb-8 ${className}`} aria-busy="true" aria-live="polite">
      {children}
    </main>
  );
}

function PictureHeroSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <section className="-mt-14 overflow-hidden bg-background">
      <div className="relative min-h-[240px] bg-muted/30">
        <Skeleton className="absolute inset-0 rounded-none opacity-80" />
        <div className={`relative z-10 mx-auto flex min-h-[240px] flex-col justify-end px-3 pb-8 pt-16 sm:px-5 lg:px-8 ${wide ? "max-w-[90rem]" : "max-w-6xl"}`}>
          <div className="w-full max-w-2xl space-y-4">
            <Skeleton className="h-12 w-full max-w-xl md:h-14" />
            <Skeleton className="h-5 w-full max-w-lg rounded-full" />
            <Skeleton className="h-5 w-2/3 max-w-md rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

type ExploreSkeletonVariant = "projects" | "organizations" | "observations";

export function ExploreGridPageSkeleton({
  cards,
  variant = "projects",
}: {
  cards?: number;
  variant?: ExploreSkeletonVariant;
}) {
  const cardCount = cards ?? (variant === "observations" ? 18 : variant === "organizations" ? 12 : 6);
  const gridClass =
    variant === "observations"
      ? "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      : variant === "organizations"
        ? "grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:gap-4"
        : "grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]";

  return (
    <PageShell>
      <PictureHeroSkeleton wide />
      <section className="relative z-10 mx-auto max-w-[90rem] px-3 pt-5 sm:px-5 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-11 min-w-0 basis-full rounded-full sm:h-10 sm:basis-auto sm:flex-1" />
          <Skeleton className="size-11 shrink-0 rounded-full sm:size-10" />
          <Skeleton className="h-11 w-28 shrink-0 rounded-full sm:h-10" />
        </div>
        {variant === "projects" ? (
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="min-h-20 rounded-2xl" />
            ))}
          </div>
        ) : null}
        <div className={`mt-6 ${gridClass}`}>
          {Array.from({ length: cardCount }).map((_, index) =>
            variant === "observations" ? (
              <Skeleton key={index} className="aspect-square rounded-lg" />
            ) : (
              <article key={index} className="flex h-full flex-col overflow-hidden rounded-2xl bg-muted">
                <Skeleton className="aspect-[16/10] rounded-none" />
                <div className="flex flex-1 flex-col space-y-3 p-4 sm:p-5">
                  <Skeleton className="h-6 w-3/4 rounded-full" />
                  <Skeleton className="h-4 w-full rounded-full" />
                  <Skeleton className="h-4 w-2/3 rounded-full" />
                  <div className="flex-1" />
                  <Skeleton className="h-7 w-24 rounded-full" />
                </div>
              </article>
            ),
          )}
        </div>
      </section>
    </PageShell>
  );
}

export function InlineCardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <section className="py-6" aria-busy="true" aria-live="polite">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full rounded-full sm:max-w-xs" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {Array.from({ length: cards }).map((_, index) => (
          <article key={index} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="space-y-2.5 p-4">
              <Skeleton className="h-5 w-3/4 rounded-full" />
              <Skeleton className="h-4 w-full rounded-full" />
              <Skeleton className="h-4 w-2/3 rounded-full" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DashboardStatsPageSkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: 4 }).map((_, index) => (
        <article key={index} className="rounded-2xl bg-muted p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-4 w-3/4 rounded-full" />
          <Skeleton className="mt-2 h-3 w-1/2 rounded-full" />
        </article>
      ))}
    </section>
  );
}

export function DonationsHubSkeleton() {
  return (
    <PageShell className="md:pb-28">
      <PictureHeroSkeleton />
      <section className="relative z-10 mx-auto max-w-6xl px-3 pt-6 sm:px-5 lg:px-8">
        <div className="mb-5 flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
        <DashboardStatsPageSkeleton />
      </section>
    </PageShell>
  );
}

export function TainaPageSkeleton() {
  return (
    <main className="-mt-14 bg-background pb-8" aria-busy="true" aria-live="polite">
      <div className="relative isolate min-h-[240px] overflow-hidden bg-card">
        <div className="mx-auto flex max-w-6xl flex-col px-3 pb-8 pt-16 sm:px-5 lg:px-8">
          <Skeleton className="h-12 w-full max-w-md" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-5 w-full max-w-2xl rounded-full" />
            <Skeleton className="h-5 w-2/3 max-w-xl rounded-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-3 pt-6 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12 lg:px-8 lg:pt-8">
        <section className="max-w-xl">
          <Skeleton className="h-20 max-w-lg rounded-2xl" />
          <div className="mt-8 space-y-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-start gap-4">
                <Skeleton className="size-11 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 rounded-full" />
                  <Skeleton className="h-4 w-full rounded-full" />
                  <Skeleton className="h-4 w-2/3 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="rounded-2xl bg-muted p-4 sm:p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-4 h-4 w-full rounded-full" />
            <Skeleton className="mt-2 h-4 w-2/3 rounded-full" />
            <Skeleton className="mt-6 h-11 w-full rounded-full" />
          </div>
        </section>
      </div>
    </main>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <PageShell>
      <header className="mx-auto max-w-6xl px-3 pt-6 sm:px-5 lg:px-8">
        <Skeleton className="h-5 w-24 rounded-full" />
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        <div className="mt-3 space-y-3">
          <Skeleton className="h-12 w-full max-w-2xl md:h-14" />
          <Skeleton className="h-12 w-2/3 max-w-xl md:h-14" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
          <Skeleton className="ml-auto h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <Skeleton className="mt-6 aspect-[16/10] w-full rounded-2xl sm:aspect-[16/7]" />
        <div className="mt-5 border-t border-border-soft pt-3">
          <Skeleton className="h-9 w-56 rounded-full" />
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 gap-y-8 px-3 pb-8 pt-4 sm:px-5 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <div className="min-w-0 space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-5 w-5/6 rounded-full" />
            <Skeleton className="h-5 w-2/3 rounded-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-2xl bg-muted p-4">
                <Skeleton className="h-4 w-20 rounded-full" />
                <Skeleton className="mt-3 h-8 w-16 rounded-full" />
              </div>
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <section key={index} className="border-t border-border-soft pt-6">
              <div className="mb-5 flex items-center gap-2">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 w-36 rounded-full" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            </section>
          ))}
        </div>
        <aside className="min-w-0">
          <div className="space-y-4 rounded-3xl bg-muted p-4 lg:sticky lg:top-24">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Skeleton className="h-10 rounded-full" />
              <Skeleton className="h-10 rounded-full" />
            </div>
          </div>
        </aside>
      </section>
    </PageShell>
  );
}

export function ObservationDetailSkeleton() {
  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="mt-4 h-7 w-28 rounded-full" />
        <div className="mt-3 space-y-3">
          <Skeleton className="h-12 w-full max-w-xl md:h-14" />
          <Skeleton className="h-9 w-2/3 max-w-sm" />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <Skeleton className="aspect-[4/3] w-full rounded-3xl sm:aspect-[16/10]" />
            <div className="mt-4 border-t border-border-soft pt-3">
              <Skeleton className="h-9 w-56 rounded-full" />
            </div>
          </div>
          <aside className="min-w-0 space-y-5">
            <div className="overflow-hidden rounded-2xl bg-muted divide-y divide-background">
              <div className="p-4">
                <Skeleton className="h-3 w-24 rounded-full" />
                <div className="mt-3 flex items-center gap-3">
                  <Skeleton className="size-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-36 rounded-full" />
                    <Skeleton className="h-3 w-24 rounded-full" />
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Skeleton className="size-4 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-20 rounded-full" />
                      <Skeleton className="h-4 w-40 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Skeleton className="h-56 rounded-2xl" />
          </aside>
        </div>
        <section className="mt-10 border-t border-border-soft pt-8">
          <Skeleton className="mb-5 h-4 w-40 rounded-full" />
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton className="h-4 w-36 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

export function FeedPageSkeleton() {
  return (
    <main className="-mt-14 pb-24 sm:pb-8" aria-busy="true" aria-live="polite">
      <div className="bg-linear-to-b from-primary/8 via-primary/2 to-transparent">
        <div className="mx-auto max-w-3xl px-3 pb-4 pt-16 sm:px-5 sm:pb-6 sm:pt-20 lg:max-w-4xl lg:px-8">
          <Skeleton className="h-10 w-full max-w-md sm:h-12" />
          <Skeleton className="mt-3 hidden h-5 w-full max-w-lg rounded-full sm:block" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-3xl gap-10 px-3 sm:px-5 lg:max-w-4xl lg:px-8">
        <div className="min-w-0 flex-1">
          <div className="hidden rounded-2xl border border-border/60 bg-muted p-3 sm:mb-3 sm:block">
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-16 min-w-0 flex-1 rounded-xl" />
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, index) => (
              <article key={index} className="px-3 py-3">
                <div className="flex gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/3 rounded-full" />
                    <Skeleton className="h-3 w-1/4 rounded-full" />
                    <Skeleton className="h-4 w-4/5 rounded-full" />
                    <Skeleton className="h-3 w-2/3 rounded-full" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside className="hidden w-44 shrink-0 space-y-3 lg:block">
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-10 w-full rounded-full" />
        </aside>
      </div>
    </main>
  );
}

export function BioblitzPageSkeleton() {
  return (
    <main
      className="relative -mt-14 flex min-h-dvh flex-col overflow-hidden bg-background"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/10 via-background/80 to-background" />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-3 pb-4 pt-[calc(3.5rem+0.75rem)] sm:px-5 lg:px-8">
        <header className="space-y-3 py-4">
          <Skeleton className="h-10 w-64 max-w-[75vw] rounded-full" />
          <Skeleton className="h-4 w-full max-w-xl rounded-full" />
          <Skeleton className="h-4 w-2/3 max-w-md rounded-full" />
        </header>

        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-28 shrink-0 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />

        <div className="grid flex-1 gap-4 lg:min-h-[34rem] lg:grid-cols-[minmax(0,5fr)_1px_minmax(0,7fr)]">
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="space-y-3 border-y border-border py-5">
              <Skeleton className="h-6 w-40 rounded-full" />
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <Skeleton className="h-4 flex-1 rounded-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
          <div className="hidden bg-border lg:block" />
          <div className="rounded-2xl bg-muted p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-7 w-40 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
            <div className="mt-5 divide-y divide-border">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 py-3">
                  <Skeleton className="size-11 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3 rounded-full" />
                    <Skeleton className="h-3 w-1/3 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-12 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function GlobePageSkeleton() {
  return (
    <main className="relative min-h-[calc(100dvh-4rem)] overflow-hidden bg-[#0d1612]" aria-busy="true" aria-live="polite">
      <Skeleton className="absolute inset-0 rounded-none opacity-40" />

      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 md:hidden">
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="h-11 w-40 max-w-[52vw] rounded-full" />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl border-t border-white/10 bg-background/90 p-4 shadow-2xl backdrop-blur md:hidden">
        <div className="mx-auto h-2 w-24 rounded-full bg-muted" />
        <div className="mt-4 grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-11 rounded-full" />
          ))}
        </div>
        <Skeleton className="mt-4 h-10 w-full rounded-xl" />
      </div>

      <div className="absolute left-1/2 top-3 z-10 hidden -translate-x-1/2 gap-2 rounded-full border border-white/10 bg-background/90 p-1 shadow-xl backdrop-blur md:flex">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-24 rounded-full" />
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 z-10 hidden w-[380px] border-r border-white/10 bg-background/90 px-4 pb-4 pt-20 shadow-2xl backdrop-blur md:block">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-4 h-10 w-full rounded-xl" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-3/4 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
