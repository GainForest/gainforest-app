import { Skeleton } from "@/components/ui/skeleton";

function PageShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main className={`min-h-screen bg-background pb-20 ${className}`} aria-busy="true" aria-live="polite">
      {children}
    </main>
  );
}

function PictureHeroSkeleton() {
  return (
    <section className="-mt-14 overflow-hidden bg-background">
      <div className="relative min-h-[360px] border-b border-border/60 bg-muted/30">
        <Skeleton className="absolute inset-0 rounded-none opacity-80" />
        <div className="relative z-10 mx-auto flex min-h-[360px] max-w-6xl items-end px-6 pb-12 pt-28 lg:px-8">
          <div className="w-full max-w-2xl space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-36 rounded-full" />
            </div>
            <Skeleton className="h-14 w-full max-w-xl md:h-16" />
            <Skeleton className="h-5 w-full max-w-lg rounded-full" />
            <Skeleton className="h-5 w-2/3 max-w-md rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function ExploreGridPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <PageShell>
      <PictureHeroSkeleton />
      <section className="relative z-10 mx-auto -mt-8 max-w-6xl px-6 lg:px-8">
        <div className="rounded-3xl border border-border/60 bg-card/90 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-11 w-full rounded-full md:max-w-sm" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-28 rounded-full" />
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-stretch gap-6 lg:gap-8">
          {Array.from({ length: cards }).map((_, index) => (
            <article key={index} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <Skeleton className="aspect-[16/10] rounded-none" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-6 w-3/4 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-2/3 rounded-full" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-7 w-24 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
              </div>
            </article>
          ))}
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
    <section className="grid gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4 lg:px-8" aria-busy="true" aria-live="polite">
      {Array.from({ length: 4 }).map((_, index) => (
        <article key={index} className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-sm">
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
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-6 lg:px-8">
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
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8 md:pt-12" aria-busy="true" aria-live="polite">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
        <section className="max-w-xl">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-full" />
          </div>
          <Skeleton className="mt-5 h-14 w-full max-w-lg" />
          <Skeleton className="mt-3 h-12 w-4/5" />
          <div className="mt-5 space-y-2">
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-5 w-5/6 rounded-full" />
          </div>
          <Skeleton className="mt-5 h-20 max-w-lg rounded-2xl" />
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
        <section className="lg:pt-2">
          <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
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
      <header className="mx-auto max-w-6xl px-6 pt-6 lg:px-8">
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
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 gap-y-8 px-6 pb-8 pt-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <div className="min-w-0 space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-5 w-5/6 rounded-full" />
            <Skeleton className="h-5 w-2/3 rounded-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-border/60 bg-card/70 p-4">
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
          <div className="space-y-4 rounded-3xl border border-border/60 bg-card p-4 lg:sticky lg:top-24">
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
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
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
            <div className="rounded-2xl border border-border-soft bg-surface/60 p-4">
              <Skeleton className="h-3 w-24 rounded-full" />
              <div className="mt-3 flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-36 rounded-full" />
                  <Skeleton className="h-3 w-24 rounded-full" />
                </div>
              </div>
            </div>
            <div className="space-y-4 rounded-2xl border border-border-soft bg-surface/60 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Skeleton className="size-4 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-20 rounded-full" />
                    <Skeleton className="h-4 w-40 rounded-full" />
                  </div>
                </div>
              ))}
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
    <main className="mx-auto w-full max-w-3xl px-6 py-8" aria-busy="true" aria-live="polite">
      <div className="mb-6 rounded-3xl border border-border/60 bg-card/90 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 rounded-full" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <article key={index} className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm">
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
    </main>
  );
}

export function BioblitzPageSkeleton() {
  return (
    <main className="min-h-screen bg-background pb-20" aria-busy="true" aria-live="polite">
      <PictureHeroSkeleton />
      <section className="relative z-10 mx-auto -mt-8 grid max-w-6xl gap-4 px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <div className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-sm">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-3 h-4 w-full rounded-full" />
          <Skeleton className="mt-2 h-4 w-3/4 rounded-full" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-2xl" />
            ))}
          </div>
        </div>
        <aside className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-sm">
          <Skeleton className="h-6 w-32" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-36 max-w-full" />
                <Skeleton className="ml-auto h-4 w-10 shrink-0" />
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

export function GlobePageSkeleton() {
  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#0d1612]" aria-busy="true" aria-live="polite">
      <Skeleton className="absolute inset-0 rounded-none opacity-40" />
      <div className="absolute left-4 top-4 z-10 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-background/90 p-4 shadow-2xl backdrop-blur">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-3 h-4 w-full rounded-full" />
        <Skeleton className="mt-2 h-4 w-2/3 rounded-full" />
        <div className="mt-5 space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-3/4 rounded-xl" />
        </div>
      </div>
      <div className="absolute bottom-6 left-1/2 z-10 grid w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 grid-cols-3 gap-2 rounded-full border border-white/10 bg-background/85 p-2 shadow-2xl backdrop-blur">
        <Skeleton className="h-9 rounded-full" />
        <Skeleton className="h-9 rounded-full" />
        <Skeleton className="h-9 rounded-full" />
      </div>
    </main>
  );
}
