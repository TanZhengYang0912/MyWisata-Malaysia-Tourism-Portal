export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-hidden="true">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-muted" />
          <div className="h-4 w-72 rounded-md bg-muted/60" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-lg bg-muted" />
          <div className="h-9 w-24 rounded-lg bg-muted" />
        </div>
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 rounded bg-muted" />
              <div className="h-8 w-8 rounded-lg bg-muted" />
            </div>
            <div className="h-7 w-24 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted/60" />
          </div>
        ))}
      </div>

      {/* Filter / Search Bar Skeleton */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="h-9 w-full sm:w-64 rounded-lg bg-muted" />
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="h-9 w-20 rounded-lg bg-muted" />
          <div className="h-9 w-24 rounded-lg bg-muted" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-11 bg-muted/40 border-b border-border flex items-center px-4 gap-4">
          <div className="h-4 w-8 rounded bg-muted" />
          <div className="h-4 w-1/4 rounded bg-muted" />
          <div className="h-4 w-1/5 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted ml-auto" />
          <div className="h-4 w-20 rounded bg-muted" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 border-b border-border/60 flex items-center px-4 gap-4">
            <div className="h-5 w-5 rounded bg-muted" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-1/4 rounded bg-muted/60" />
            </div>
            <div className="h-6 w-20 rounded-full bg-muted/80" />
            <div className="h-4 w-16 rounded bg-muted/60" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-muted" />
              <div className="h-8 w-8 rounded-lg bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
