import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

type Block = { id: string; type: string; title?: string; body?: string; imageUrl?: string };

async function getOutletPage(outletId: string) {
  const db = await createClient();
  return db.from('outlets').select('id,name,address,city,state,operating_hours,outlet_pages(hero_url,brand_colour,font_family,featured_ids,seo_title,seo_description,blocks,gallery)').eq('id', outletId).maybeSingle();
}

export async function generateMetadata({ params }: { params: Promise<{ outletId: string }> }): Promise<Metadata> {
  const { outletId } = await params;
  const { data } = await getOutletPage(outletId);
  const page = Array.isArray(data?.outlet_pages) ? data?.outlet_pages[0] : data?.outlet_pages;
  return { title: page?.seo_title || data?.name || 'MyWisata outlet', description: page?.seo_description || `Explore products and experiences at ${data?.name || 'this MyWisata outlet'}.` };
}

export default async function OutletShopPage({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params;
  const db = await createClient();
  const [{ data: outlet }, { data: page }] = await Promise.all([
    db.from('outlets').select('id,name,address,city,state,operating_hours').eq('id', outletId).maybeSingle(),
    db.from('outlet_pages').select('hero_url,brand_colour,font_family,featured_ids,seo_title,seo_description,blocks,gallery').eq('outlet_id', outletId).maybeSingle(),
  ]);
  if (!outlet) notFound();
  const blocks = (page?.blocks || []) as Block[];
  const gallery = (page?.gallery || []) as string[];
  const featuredIds = Array.isArray(page?.featured_ids) ? page.featured_ids : [];
  const { data: products } = featuredIds.length ? await db.from('products').select('id,name,base_price,cover_url').eq('outlet_id', outletId).eq('status', 'active').in('id', featuredIds) : { data: [] };
  const featuredProducts = [...(products || [])].sort((a, b) => featuredIds.indexOf(a.id) - featuredIds.indexOf(b.id));
  return <main className="min-h-screen" style={{ background: '#f8faf8', color: '#15332c', fontFamily: page?.font_family || 'Inter, sans-serif' }}><section className="relative overflow-hidden" style={{ backgroundColor: page?.brand_colour || '#0d5c4a' }}>{page?.hero_url && <img src={page.hero_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />}<div className="relative mx-auto max-w-5xl px-6 py-24 text-white"><p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Verified MyWisata outlet</p><h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">{outlet.name}</h1><p className="mt-4 max-w-2xl text-sm opacity-90">{outlet.address || [outlet.city, outlet.state].filter(Boolean).join(', ')}</p></div></section><div className="mx-auto max-w-5xl px-6 py-10"><div className="grid gap-6 md:grid-cols-2">{blocks.map((block) => <section key={block.id} className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{block.type.replace('_', ' ')}</p><h2 className="mt-2 text-xl font-bold">{block.title || 'Discover this outlet'}</h2>{block.body && <p className="mt-2 text-sm leading-6 text-slate-600">{block.body}</p>}{block.imageUrl && <img src={block.imageUrl} alt="" className="mt-4 h-40 w-full rounded-xl object-cover" />}{block.type === 'product_grid' && <div className="mt-4 grid gap-3 sm:grid-cols-2">{featuredProducts.map((product) => <a key={product.id} href={`/customer/activity/${product.id}`} className="overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/40 transition hover:-translate-y-0.5"><div className="h-28 bg-emerald-100">{product.cover_url && <img src={product.cover_url} alt="" className="h-full w-full object-cover" />}</div><div className="p-3"><p className="truncate text-sm font-bold">{product.name}</p><p className="mt-1 text-xs font-semibold text-emerald-700">RM {Number(product.base_price).toFixed(2)}</p></div></a>)}</div>}</section>)}</div>{gallery.length > 0 && <section className="mt-8"><h2 className="text-xl font-bold">Gallery</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{gallery.map((url) => <img key={url} src={url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />)}</div></section>}<section className="mt-8 rounded-2xl border border-amber-100 bg-amber-50 p-5"><h2 className="font-bold">Opening hours</h2><p className="mt-1 text-sm text-slate-700">{outlet.operating_hours?.hours || 'Check the outlet schedule before booking.'}</p></section></div></main>;
}
