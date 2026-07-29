import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getVendor(vendorId: string) {
  const db = await createClient();
  const { data: vendor } = await db.from('vendors').select('id,name,slug,description,logo_url,cover_url').eq('id', vendorId).eq('status', 'approved').maybeSingle();
  if (!vendor) return null;
  const { data: outlets } = await db.from('outlets').select('id,name,city,state,address').eq('vendor_id', vendorId).eq('status', 'active').eq('review_status', 'approved').order('name');

  // Brand-level catalogue: one card per product, listing which outlets sell it.
  // A shared product has outlet_id = NULL and its outlets come from
  // outlet_offers; a single-outlet product still carries its own outlet_id.
  const { data: products } = await db
    .from('products')
    .select('id,name,base_price,cover_url,outlet_id,outlet_offers(outlet_id,price,status)')
    .eq('vendor_id', vendorId)
    .eq('status', 'active')
    .eq('review_status', 'approved')
    .order('name');

  const outletNames = new Map((outlets ?? []).map((outlet) => [outlet.id, outlet.name]));
  const catalogue = (products ?? []).map((product) => {
    const offers = ((product.outlet_offers ?? []) as { outlet_id: string; price: number; status: string }[])
      .filter((offer) => offer.status === 'active' && outletNames.has(offer.outlet_id));
    const soldAt = offers.length
      ? offers.map((offer) => ({ id: offer.outlet_id, name: outletNames.get(offer.outlet_id)!, price: Number(offer.price) }))
      : product.outlet_id && outletNames.has(product.outlet_id)
        ? [{ id: product.outlet_id, name: outletNames.get(product.outlet_id)!, price: Number(product.base_price) }]
        : [];
    return {
      id: product.id,
      name: product.name,
      coverUrl: product.cover_url as string | null,
      fromPrice: soldAt.length ? Math.min(...soldAt.map((entry) => entry.price)) : Number(product.base_price),
      soldAt,
    };
  }).filter((product) => product.soldAt.length > 0);

  return { vendor, outlets: outlets ?? [], catalogue };
}

export async function generateMetadata({ params }: { params: Promise<{ vendorId: string }> }): Promise<Metadata> {
  const result = await getVendor((await params).vendorId);
  if (!result) return { title: 'Vendor not found' };
  return { title: `${result.vendor.name} | MyWisata`, description: result.vendor.description ?? `Explore ${result.vendor.name} outlets and experiences.`, openGraph: { title: result.vendor.name, description: result.vendor.description ?? undefined, images: result.vendor.cover_url ? [{ url: result.vendor.cover_url }] : undefined } };
}

export default async function VendorBrandPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const result = await getVendor((await params).vendorId);
  if (!result) notFound();
  const { vendor, outlets, catalogue } = result;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Organization', name: vendor.name, description: vendor.description, url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/customer/vendor/${vendor.id}` };
  return <main className="min-h-screen bg-[#f8fafc] text-slate-900"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /><section className="bg-[#010066] px-6 py-16 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffd21f]">Verified MyWisata vendor</p><h1 className="mt-3 text-4xl font-bold tracking-tight">{vendor.name}</h1>{vendor.description && <p className="mt-4 max-w-2xl text-white/75">{vendor.description}</p>}</div></section><section className="mx-auto max-w-6xl px-6 py-10"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Outlet switcher</p><h2 className="mt-1 text-2xl font-bold">Choose a location</h2></div><span className="text-sm text-slate-500">{outlets.length} outlet{outlets.length === 1 ? '' : 's'}</span></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{outlets.map((outlet) => <Link key={outlet.id} href={`/customer/outlet/${outlet.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary/40"><p className="text-lg font-bold">{outlet.name}</p><p className="mt-2 text-sm text-slate-500">{[outlet.city, outlet.state].filter(Boolean).join(', ') || 'Malaysia'}</p>{outlet.address && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{outlet.address}</p>}<span className="mt-5 inline-flex text-sm font-semibold text-primary">View outlet shop →</span></Link>)}</div>{outlets.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-slate-500">No public outlets yet.</p>}</section>
    <section className="mx-auto max-w-6xl px-6 pb-14">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Menu</p>
        <h2 className="mt-1 text-2xl font-bold">What {vendor.name} sells</h2>
      </div>
      {catalogue.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate-500">No products published yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {catalogue.map((product) => (
            <Link key={product.id} href={`/customer/activity/${product.id}`} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-primary/40">
              {product.coverUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={product.coverUrl} alt={product.name} className="h-36 w-full object-cover" />
              )}
              <div className="flex flex-1 flex-col p-5">
                <p className="text-base font-bold">{product.name}</p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {product.soldAt.length > 1 ? 'From ' : ''}RM {product.fromPrice.toFixed(2)}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Available at {product.soldAt.length} outlet{product.soldAt.length === 1 ? '' : 's'}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {product.soldAt.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate">{entry.name}</span>
                      <span className="shrink-0 font-medium text-slate-600">RM {entry.price.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section></main>;
}
