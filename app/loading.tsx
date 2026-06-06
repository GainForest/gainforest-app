export default function Loading() {
  return (
    <div className="min-h-[60vh] px-6 py-16">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-muted" />
          <div className="h-10 w-full max-w-xl rounded-2xl bg-muted" />
          <div className="h-4 w-full max-w-2xl rounded-full bg-muted" />
          <div className="h-4 w-2/3 max-w-lg rounded-full bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-3xl border border-border bg-background p-4 shadow-sm">
              <div className="mb-4 aspect-[4/3] rounded-2xl bg-muted" />
              <div className="space-y-2">
                <div className="h-4 w-3/4 rounded-full bg-muted" />
                <div className="h-3 w-full rounded-full bg-muted" />
                <div className="h-3 w-1/2 rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Loading page…
        </p>
      </div>
    </div>
  );
}
