export default function CustomerLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
      {/* Hero / search bar skeleton */}
      <div className="h-48 rounded-2xl bg-muted mb-8" />

      {/* Section title */}
      <div className="h-6 w-40 rounded bg-muted mb-4" />

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden bg-muted">
            <div className="h-44 bg-muted-foreground/10" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted-foreground/10" />
              <div className="h-3 w-1/2 rounded bg-muted-foreground/10" />
            </div>
          </div>
        ))}
      </div>

      {/* Second section title */}
      <div className="h-6 w-32 rounded bg-muted mb-4" />

      {/* Horizontal scroll row */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-56 rounded-xl bg-muted h-36" />
        ))}
      </div>
    </div>
  );
}
