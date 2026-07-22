export default function MyCardsLoading() {
  return (
    <div className="min-h-full px-4 py-8 sm:px-6 sm:py-12" aria-busy="true">
      <div className="mx-auto max-w-6xl">
        <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
        <div className="mt-4 h-12 w-56 max-w-full animate-pulse rounded-xl bg-muted" />
        <div className="mt-4 h-5 w-[32rem] max-w-full animate-pulse rounded-lg bg-muted" />
        <div className="mt-12 grid justify-items-center gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="aspect-[63/88] w-[21rem] max-w-full animate-pulse rounded-[1.7rem] bg-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
