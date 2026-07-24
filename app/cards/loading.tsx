export default function MyCardsLoading() {
  return (
    <div className="min-h-full px-3 py-4 sm:px-5 lg:px-8 lg:py-6" aria-busy="true">
      <div className="mx-auto max-w-6xl">
        <div className="h-12 w-56 max-w-full animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="mt-4 h-5 w-[32rem] max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="mt-8 grid items-stretch justify-items-center gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <article key={key} className="flex h-full w-[21rem] max-w-full flex-col">
              <div className="aspect-[63/88] w-full animate-pulse rounded-[1.7rem] bg-muted motion-reduce:animate-none" />
              <div className="mt-3 flex-1 rounded-2xl bg-muted px-4 py-3">
                <div className="h-4 w-3/4 animate-pulse rounded-full bg-background motion-reduce:animate-none" />
                <div className="mt-3 h-8 w-full animate-pulse rounded-lg bg-background motion-reduce:animate-none" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
