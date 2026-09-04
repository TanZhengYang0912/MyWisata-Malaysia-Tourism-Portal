export default function SearchLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
      {/* Search bar */}
      <div className="h-12 rounded-xl bg-muted mb-6" />

      {/* Result count */}
      <div className="h-4 w-32 rounded bg-muted mb-4" />

      {/* Results list */}
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-xl bg-muted p-4">
            <div className="h-20 w-24 rounded-lg bg-muted-foreground/10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted-foreground/10" />
              <div className="h-3 w-1/2 rounded bg-muted-foreground/10" />
              <div className="h-3 w-1/4 rounded bg-muted-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
