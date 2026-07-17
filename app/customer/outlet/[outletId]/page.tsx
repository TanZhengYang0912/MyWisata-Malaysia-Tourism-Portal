import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { selectPublicDocument } from '@/lib/vendor/outlet-page-persistence';
import { OutletPageRenderer } from '@/components/outlet/outlet-page-renderer';
import { ShareButton } from '@/components/shared/share-button';

export const dynamic = 'force-dynamic';

async function getPublicOutletPage(outletId: string) {
  const db = await createClient();
  const [{ data: outlet }, { data: page }] = await Promise.all([
    db.from('outlets').select('id,name,address,city,state,operating_hours').eq('id', outletId).eq('status', 'active').maybeSingle(),
    db.from('public_outlet_pages').select('*').eq('outlet_id', outletId).maybeSingle(),
  ]);
  return { outlet, page };
}

export async function generateMetadata({ params }: { params: Promise<{ outletId: string }> }): Promise<Metadata> {
  const { outlet, page } = await getPublicOutletPage((await params).outletId);
  if (!outlet) return { title: 'Outlet not found' };
  const document = selectPublicDocument(page || {});
  return {
    title: document.seoTitle || outlet.name || 'MyWisata outlet',
    description: document.seoDescription || `Explore products and experiences at ${outlet.name}.`,
    openGraph: {
      title: document.seoTitle || outlet.name,
      description: document.seoDescription || `Explore products and experiences at ${outlet.name}.`,
      images: document.hero.imageUrl ? [{ url: document.hero.imageUrl }] : undefined,
    },
  };
}

export default async function OutletShopPage({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params;
  const { outlet, page } = await getPublicOutletPage(outletId);
  if (!outlet) notFound();

  const document = selectPublicDocument(page || {});
  const { data: products } = document.featuredIds.length
    ? await createClient().then((db) => db.from('products').select('id,name,base_price,cover_url').eq('outlet_id', outletId).eq('status', 'active').in('id', document.featuredIds))
    : { data: [] };
  const orderedProducts = [...(products || [])].sort((a, b) => document.featuredIds.indexOf(a.id) - document.featuredIds.indexOf(b.id));
  const jsonLd = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: outlet.name, address: { '@type': 'PostalAddress', streetAddress: outlet.address, addressLocality: outlet.city, addressRegion: outlet.state, addressCountry: 'MY' }, url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/customer/outlet/${outlet.id}` };

  return <main className="min-h-screen bg-[#f8fafc] text-slate-900">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 pt-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Verified MyWisata outlet</p><p className="mt-1 text-sm font-semibold text-slate-600">{outlet.name}</p></div>
      <ShareButton shareType="outlet" contentId={outlet.id} title={outlet.name} />
    </div>
    <OutletPageRenderer document={document} outlet={outlet} products={orderedProducts.map((product) => ({ ...product, base_price: Number(product.base_price) }))} mode="public" />
  </main>;
}
