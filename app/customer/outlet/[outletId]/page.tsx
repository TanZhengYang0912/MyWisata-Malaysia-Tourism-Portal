import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { selectPublicDocument } from '@/lib/vendor/outlet-page-persistence';
import { getOutletProductIds } from '@/backend/domains/catalogue';
import { selectPublicOutletProductIds } from '@/lib/customer/outlet-shop';
import { OutletPageRenderer } from '@/components/outlet/outlet-page-renderer';
import { ShareButton } from '@/components/shared/share-button';
import { OutletChatButton } from '@/components/customer/outlet-chat-button';

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
  // A featured product may be a shared vendor product (outlet_id = NULL) that
  // this outlet sells through an offer. When no featured list is configured,
  // fall back to every active, approved product sold by this outlet so a new
  // public shop never renders as an empty page by default.
  const db = await createClient();
  const sellable = await getOutletProductIds(db, outletId);
  const productIds = selectPublicOutletProductIds(document.featuredIds, [...sellable]);
  const { data: products } = productIds.length
    ? await db.from('products').select('id,name,description,base_price,requires_booking,cover_url').eq('status', 'active').eq('review_status', 'approved').in('id', productIds)
    : { data: [] };
  const productOrder = new Map(productIds.map((id, index) => [id, index]));
  const orderedProducts = [...(products || [])].sort((a, b) => (productOrder.get(a.id) ?? 0) - (productOrder.get(b.id) ?? 0));
  const jsonLd = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: outlet.name, address: { '@type': 'PostalAddress', streetAddress: outlet.address, addressLocality: outlet.city, addressRegion: outlet.state, addressCountry: 'MY' }, url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/customer/outlet/${outlet.id}` };

  return <main className="min-h-screen bg-[#f8fafc] text-slate-900">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 pt-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Verified MyWisata outlet</p><p className="mt-1 text-sm font-semibold text-slate-600">{outlet.name}</p></div>
      <div className="flex items-center gap-2"><ShareButton shareType="outlet" contentId={outlet.id} title={outlet.name} /><OutletChatButton outletId={outlet.id} /></div>
    </div>
    <OutletPageRenderer document={document} outlet={outlet} products={orderedProducts.map((product) => ({ ...product, base_price: Number(product.base_price) }))} mode="public" />
  </main>;
}
