// P3 — Member 3 owns the discovery view
// P4 — Member 4 owns the "Add to cart" action on this page
// Sub-modules: C1 detail view + D1 cart integration

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

interface Props { params: Promise<{ slug: string }> }

export default async function VendorDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase  = await createClient();

  const { data: vendor } = await supabase
    .from('vendors')
    .select(`*, outlets ( *, products ( *, product_variants (*), booking_slots (*) ) )`)
    .eq('slug', slug)
    .eq('status', 'approved')
    .single();

  if (!vendor) notFound();

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative h-48 bg-gray-200 rounded-2xl overflow-hidden">
        {vendor.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vendor.cover_url} alt={vendor.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">No cover image</div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-4">
          <h1 className="text-2xl font-bold text-white">{vendor.name}</h1>
          <p className="text-white/80 text-sm">{vendor.description}</p>
        </div>
      </div>

      {/* Outlets */}
      {(vendor.outlets as Record<string, unknown>[]).map((outlet: Record<string, unknown>) => (
        <section key={String(outlet.id)} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{String(outlet.name)}</h2>
            {/* TODO P3/C1: Leaflet map + Get Directions button */}
            {outlet.lat && outlet.lng && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${outlet.lat},${outlet.lng}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:underline"
              >
                Get Directions →
              </a>
            )}
          </div>

          {/* Products */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {((outlet.products as Record<string, unknown>[]) ?? []).map((p: Record<string, unknown>) => (
              <div key={String(p.id)} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <h3 className="font-medium text-sm">{String(p.name)}</h3>
                <p className="text-xs text-gray-500 line-clamp-2">{String(p.description ?? '')}</p>
                <p className="text-primary-600 font-semibold text-sm">RM {Number(p.base_price).toFixed(2)}</p>
                {/* TODO P4/D1: Add to cart button — call /api/cart POST */}
                <button className="w-full bg-primary-600 text-white text-sm py-1.5 rounded-lg hover:bg-primary-700 transition-colors">
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Chat with vendor */}
      {/* TODO P1/A3: ChatButton component — opens thread for this outlet */}
      <div className="fixed bottom-24 right-4 md:bottom-6">
        <button className="bg-green-600 text-white px-4 py-2.5 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700 transition-colors">
          💬 Chat with vendor
        </button>
      </div>
    </div>
  );
}
