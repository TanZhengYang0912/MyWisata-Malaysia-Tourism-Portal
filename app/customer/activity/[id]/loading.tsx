export default function ActivityLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
      {/* Hero image */}
      <div className="h-72 rounded-2xl bg-muted mb-8 w-full" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          <div className="h-8 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="space-y-2 mt-4">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
          </div>
        </div>
        {/* Sidebar / booking panel */}
        <div className="rounded-xl bg-muted h-64" />
      </div>
    </div>
  );
}
