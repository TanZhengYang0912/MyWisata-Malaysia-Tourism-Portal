export default function GlobalLoading() {
  return (
    <div className="min-h-[50vh] w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-pulse" aria-busy="true" aria-hidden="true">
      {/* Top indicator bar */}
      <div className="h-1 w-full bg-muted overflow-hidden rounded mb-8">
        <div className="h-full w-1/3 bg-primary/40 rounded animate-pulse" />
      </div>

      {/* Hero placeholder */}
      <div className="h-44 sm:h-56 w-full rounded-2xl bg-muted/60 mb-8" />

      {/* Content grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="h-36 w-full rounded-lg bg-muted/70" />
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
