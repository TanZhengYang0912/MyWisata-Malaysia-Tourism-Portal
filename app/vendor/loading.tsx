export default function VendorLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
      {/* Page title */}
      <div className="h-8 w-48 rounded bg-muted mb-6" />

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-muted p-4 h-24" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border bg-muted/20 overflow-hidden">
        <div className="h-12 bg-muted border-b" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 border-b flex items-center px-4 gap-4">
            <div className="h-4 w-1/4 rounded bg-muted" />
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/6 rounded bg-muted ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
