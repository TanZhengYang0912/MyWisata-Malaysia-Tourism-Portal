// P3 — Member 3 owns this page
// Sub-module: C1 Discovery + Map — search/filter results

export default function SearchPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Search</h1>

      {/* TODO P3/C1: Implement search + filter UI */}
      {/* Filters: category, city, budget range, requires_booking, accessibility */}
      {/* Results: ProductCard grid + Map toggle */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Filter sidebar */}
        <aside className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-medium text-sm mb-3">Filters</h2>
            {/* TODO P3: Category, City, Budget, Type filters */}
            <p className="text-xs text-gray-400">Filters — implement in C1</p>
          </div>
        </aside>
        {/* Results */}
        <main className="md:col-span-3">
          <p className="text-sm text-gray-400 text-center py-16">
            Search results — implement in C1 (connect to B2 catalogue)
          </p>
        </main>
      </div>
    </div>
  );
}
