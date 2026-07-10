// P3 — Member 3 owns this page
// Sub-module: C1 Discovery + Map
// C2 Preference + Recommendation cards

import { createClient } from '@/lib/supabase/server';

export default async function DiscoveryPage() {
  const supabase = await createClient();

  // TODO P3/C1: replace with real rule-based recommendation query
  // Weighted scoring: interests match + distance boost + rating + recency
  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug, base_price, cover_url, product_type, requires_booking, tags,
      outlets ( id, name, city, lat, lng,
        vendors ( id, name, slug )
      ),
      categories ( name )
    `)
    .eq('status', 'active')
    .limit(12);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Discover Malaysia</h1>
        <p className="text-primary-100 mb-4">Find authentic experiences, book activities, and earn rewards</p>
        {/* TODO P3/C1: SearchBar component */}
        <div className="flex gap-2">
          <input
            placeholder="Search destinations, food, activities…"
            className="flex-1 bg-white/20 placeholder-white/70 text-white border border-white/30 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <button className="bg-white text-primary-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors">
            Search
          </button>
        </div>
      </section>

      {/* Category chips */}
      {/* TODO P3/C1: CategoryFilter component from categories table */}
      <section>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {['All','Food & Dining','Nature','Cultural','Adventure','Wellness','Shopping'].map(c => (
            <button
              key={c}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm border border-gray-200 bg-white hover:bg-primary-50 hover:border-primary-300 transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Recommended For You */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recommended For You</h2>
          <a href="/search" className="text-sm text-primary-600 hover:underline">See all</a>
        </div>
        {/* TODO P3/C2: Replace static grid with RecommendedCard[] driven by scoring function */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(products ?? []).map(p => (
            <ProductCard key={p.id} product={p as Record<string, unknown>} />
          ))}
          {(products ?? []).length === 0 && (
            <p className="col-span-3 text-center text-gray-400 py-8">No listings yet — add products via Vendor portal</p>
          )}
        </div>
      </section>

      {/* Map preview strip */}
      {/* TODO P3/C1: Leaflet map component showing nearby outlet pins */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Nearby on Map</h2>
        <div className="h-48 bg-gray-200 rounded-xl flex items-center justify-center text-gray-400">
          <p className="text-sm">Map (Leaflet + OpenStreetMap) — implement in C1</p>
        </div>
      </section>
    </div>
  );
}

// Temporary inline card — P3 should extract to src/components/discovery/ProductCard.tsx
function ProductCard({ product }: { product: Record<string, unknown> }) {
  const outlet = product.outlets as Record<string, unknown> | null;
  const vendor = outlet?.vendors as Record<string, unknown> | null;
  return (
    <a href={`/vendors/${vendor?.slug}/products/${product.slug}`} className="block group">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="h-40 bg-gray-100 relative">
          {product.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={String(product.cover_url)} alt={String(product.name)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">📷</div>
          )}
          {product.requires_booking && (
            <span className="absolute top-2 left-2 bg-primary-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              BOOKING
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="text-xs text-gray-400 mb-0.5">{String(outlet?.city ?? '')}</p>
          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 line-clamp-1">
            {String(product.name)}
          </h3>
          <p className="text-sm font-bold text-primary-600 mt-1">
            RM {Number(product.base_price).toFixed(2)}
          </p>
        </div>
      </div>
    </a>
  );
}
