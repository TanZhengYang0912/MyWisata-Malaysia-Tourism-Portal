export default function ExploreLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-muted flex-shrink-0" />
        ))}
      </div>

      {/* Activity card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden bg-muted">
            <div className="h-48 bg-muted-foreground/10" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted-foreground/10" />
              <div className="h-3 w-1/2 rounded bg-muted-foreground/10" />
              <div className="h-3 w-1/4 rounded bg-muted-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
