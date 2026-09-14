import type { Metadata } from 'next';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, MapPin, Navigation, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ShareButton } from '@/components/shared/share-button';
import { ReferencePrice } from "@/components/shared/reference-price";
import { getVendorProductTypeLabel, selectFeaturedVendorProducts, summarizeVendorReviews } from '@/lib/customer/vendor-page';
import { getVendorVisual } from '@/lib/customer/vendor-visual';
import { resolveOutletImage, type ManagedPlaceImage } from '@/lib/outlet-images';
import { productImageUrl } from '@/lib/storage/product-image';
import { getServerTranslation } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

type OutletRecord = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  coverUrl: string | null;
};

type OutletOffer = { outlet_id: string; price: number; status: string };

type CatalogueProduct = {
  id: string;
  name: string;
  description: string | null;
  productType: string | null;
  requiresBooking: boolean;
  coverUrl: string | null;
  fromPrice: number;
  soldAt: Array<{ id: string; name: string; price: number }>;
  rating: number;
  reviews: number;
};

type LocationSummary = OutletRecord & {
  listingCount: number;
  fromPrice: number | null;
};

function formatBusinessType(value: string | null, t: TFunction) {
  if (!value) return t('customer:ui.vendor.localExperiencePartner');
  const key = `customer:ui.vendor.businessTypes.${value.replace(/-/g, '_')}`;
  const translated = t(key);
  return translated === key ? value.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' & ') : translated;
}

async function getVendor(vendorId: string) {
  const db = await createClient();
  const { data: vendor } = await db.from('vendors').select('id,name,slug,description,logo_url,cover_url,business_type').eq('id', vendorId).eq('status', 'approved').maybeSingle();
  if (!vendor) return null;

  const [{ data: outlets }, { data: products }, { data: managedPlaces }] = await Promise.all([
    db.from('outlets').select('id,name,city,state,address,lat,lng,outlet_pages(hero_url)').eq('vendor_id', vendorId).eq('status', 'active').eq('review_status', 'approved').order('name'),
    db.from('products').select('id,name,description,product_type,requires_booking,base_price,cover_url,outlet_id,outlet_offers(outlet_id,price,status)').eq('vendor_id', vendorId).eq('status', 'active').eq('review_status', 'approved').order('name'),
    db.from('places').select('name,image_url').eq('managed_by_vendor_id', vendorId).eq('level', 'poi').eq('status', 'active'),
  ]);

  const managedPlaceImages = (managedPlaces ?? []).map((place) => ({ name: place.name, imageUrl: place.image_url })) as ManagedPlaceImage[];
  const outletRows = (outlets ?? []).map((outlet) => {
    const outletPage = Array.isArray(outlet.outlet_pages) ? outlet.outlet_pages[0] : outlet.outlet_pages;
    return { ...outlet, coverUrl: resolveOutletImage({ outletName: outlet.name, outletHeroUrl: outletPage?.hero_url, managedPlaceImages }) };
  }) as OutletRecord[];
  const outletNames = new Map(outletRows.map((outlet) => [outlet.id, outlet.name]));
  const productRows = products ?? [];
  const metricRows = productRows.length
    ? (await db.from('product_review_metrics').select('product_id,rating,reviews').in('product_id', productRows.map((product) => product.id))).data ?? []
    : [];
  const reviewMetrics = new Map((metricRows as { product_id: string; rating: number | string; reviews: number | string }[]).map((row) => [row.product_id, { rating: Number(row.rating), reviews: Number(row.reviews) }]));

  const catalogue = productRows.map((product) => {
    const offers = ((product.outlet_offers ?? []) as OutletOffer[]).filter((offer) => offer.status === 'active' && outletNames.has(offer.outlet_id));
    const soldAt = offers.length
      ? offers.map((offer) => ({ id: offer.outlet_id, name: outletNames.get(offer.outlet_id)!, price: Number(offer.price) }))
      : product.outlet_id && outletNames.has(product.outlet_id)
        ? [{ id: product.outlet_id, name: outletNames.get(product.outlet_id)!, price: Number(product.base_price) }]
        : [];
    const metric = reviewMetrics.get(product.id) ?? { rating: 0, reviews: 0 };
    return {
      id: product.id,
      name: product.name,
      description: product.description as string | null,
      productType: product.product_type as string | null,
      requiresBooking: Boolean(product.requires_booking),
      coverUrl: productImageUrl(product.cover_url as string | null),
      fromPrice: soldAt.length ? Math.min(...soldAt.map((entry) => entry.price)) : Number(product.base_price),
      soldAt,
      rating: metric.rating,
      reviews: metric.reviews,
    } satisfies CatalogueProduct;
  }).filter((product) => product.soldAt.length > 0);

  const locations = outletRows.map((outlet) => {
    const outletProducts = catalogue.filter((product) => product.soldAt.some((entry) => entry.id === outlet.id));
    const prices = outletProducts.flatMap((product) => product.soldAt.filter((entry) => entry.id === outlet.id).map((entry) => entry.price));
    return { ...outlet, listingCount: outletProducts.length, fromPrice: prices.length ? Math.min(...prices) : null } satisfies LocationSummary;
  });

  return {
    vendor,
    locations,
    catalogue,
    featuredProducts: selectFeaturedVendorProducts(catalogue),
    reviewSummary: summarizeVendorReviews(catalogue.map((product) => ({ rating: product.rating, reviews: product.reviews }))),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ vendorId: string }> }): Promise<Metadata> {
  const result = await getVendor((await params).vendorId);
  const { t } = await getServerTranslation('customer');
  if (!result) return { title: t('ui.vendor.notFound') };
  const vendorVisual = getVendorVisual({ name: result.vendor.name, coverUrl: result.vendor.cover_url, logoUrl: result.vendor.logo_url });
  return { title: `${result.vendor.name} | MyWisata`, description: result.vendor.description ?? t('ui.vendor.metadataDescription', { vendor: result.vendor.name }), openGraph: { title: result.vendor.name, description: result.vendor.description ?? undefined, images: vendorVisual.coverUrl ? [{ url: vendorVisual.coverUrl }] : undefined } };
}

function vendorProductDetailHref(productId: string, vendorId: string, outletId?: string) {
  const outletQuery = outletId ? `&outletId=${encodeURIComponent(outletId)}` : '';
  return `/customer/activity/${productId}?source=vendor${outletQuery}&returnTo=${encodeURIComponent(`/customer/vendor/${vendorId}`)}`;
}

function ProductCard({ product, vendorId, t }: { product: CatalogueProduct; vendorId: string; t: TFunction }) {
  return <Link href={vendorProductDetailHref(product.id, vendorId, product.soldAt.length === 1 ? product.soldAt[0].id : undefined)} className="mw-card group min-w-0 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15">
    <div className="mw-card-media h-48 aspect-auto bg-secondary">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {product.coverUrl ? <img src={product.coverUrl} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center px-6 text-center text-xs font-semibold uppercase tracking-[0.16em] text-primary/60">{t('ui.vendor.photoComingSoon')}</div>}
      <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-sm">{t(`ui.vendor.productTypes.${product.productType ?? 'experience'}`)}</span>
    </div>
    <div className="mw-card-body p-4">
      <div className="flex items-start justify-between gap-3"><h3 className="mw-card-title min-w-0 flex-1 font-bold text-foreground" title={product.name}>{product.name}</h3><p className="shrink-0 text-right text-sm font-bold text-primary"><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">{t('ui.vendor.from')}</span><ReferencePrice amountMYR={product.fromPrice} /></p></div>
      <div className="mt-2 min-h-[2.5rem]">{product.description && <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{product.description}</p>}</div>
      <div className="mw-card-footer pt-4 text-xs"><span className="font-semibold text-muted-foreground">{t('ui.vendor.locationCount', { count: product.soldAt.length })}</span>{product.reviews > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Star size={13} fill="currentColor" /> {product.rating.toFixed(1)} <span className="font-normal text-muted-foreground/60">({product.reviews})</span></span> : <span className="font-semibold text-primary">{t('ui.vendor.viewProductDetails')} <ArrowRight size={13} className="ml-0.5 inline" /></span>}</div>
    </div>
  </Link>;
}

function LocationCard({ location, vendorId, t }: { location: LocationSummary; vendorId: string; t: TFunction }) {
  const visual = getVendorVisual({ name: location.name });
  const locationLabel = [location.city, location.state].filter(Boolean).join(', ') || t('ui.labels.malaysia');
  const directionsHref = location.lat !== null && location.lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([location.name, locationLabel].join(', '))}`;
  return <article className="mw-card group min-w-0 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <div className="mw-card-media relative h-36 aspect-auto overflow-hidden bg-secondary">{location.coverUrl ? <><img src={location.coverUrl} alt={location.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" /></> : <div className="flex h-full items-center justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/35 bg-white/15 text-2xl font-black text-white shadow-xl backdrop-blur-sm transition-transform duration-500 group-hover:scale-[1.02]">{visual.initials}</span></div>}<span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">{t('ui.vendor.outletIdentity')}</span><span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('ui.vendor.activeOutlet')}</span></div>
      <div className="mw-card-body p-4"><h3 className="mw-card-title font-bold text-foreground" title={location.name}>{location.name}</h3><p className="mw-card-meta mt-1 flex items-center gap-1 text-sm text-muted-foreground" title={locationLabel}><MapPin size={14} className="shrink-0 text-primary" />{locationLabel}</p><div className="mt-auto"><div className="mw-card-footer mt-4 border-t border-border pt-3 text-xs"><span className="font-semibold text-muted-foreground">{t('ui.vendor.publishedExperienceCount', { count: location.listingCount })}</span>{location.fromPrice !== null && <span className="inline-flex items-center gap-1 font-semibold text-primary">{t('ui.vendor.from')} <ReferencePrice amountMYR={location.fromPrice} /></span>}</div><div className="mt-4 flex items-center gap-2"><Link href={`/customer/vendor/${vendorId}/outlet/${location.id}`} className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90">{t('ui.vendor.viewOutlet')} <ArrowRight size={14} /></Link><a href={directionsHref} target="_blank" rel="noreferrer" aria-label={t('ui.vendor.getDirectionsTo', { outlet: location.name })} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 text-primary hover:bg-secondary"><Navigation size={16} /></a></div></div></div>
  </article>;
}

function SingleLocationSummary({ location, vendorId, t }: { location: LocationSummary; vendorId: string; t: TFunction }) {
  const visual = getVendorVisual({ name: location.name });
  const locationLabel = [location.city, location.state].filter(Boolean).join(', ') || t('ui.labels.malaysia');
  const directionsHref = location.lat !== null && location.lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([location.name, locationLabel].join(', '))}`;

  return <article className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
    <div className="flex items-start gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-secondary text-primary">{location.coverUrl ? <img src={location.coverUrl} alt={location.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xl font-black">{visual.initials}</div>}</div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('ui.vendor.outletIdentity')}</p>
        <h3 className="mt-1 text-xl font-black text-foreground" title={location.name}>{location.name}</h3>
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground" title={locationLabel}><MapPin size={14} className="shrink-0 text-primary" />{locationLabel}</p>
      </div>
    </div>
    <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-6 text-sm">
        <span className="font-semibold text-muted-foreground">{t('ui.vendor.publishedExperienceCount', { count: location.listingCount })}</span>
        {location.fromPrice !== null && <span className="inline-flex items-center gap-1 font-semibold text-primary">{t('ui.vendor.from')} <ReferencePrice amountMYR={location.fromPrice} /></span>}
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/customer/vendor/${vendorId}/outlet/${location.id}`} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90">{t('ui.vendor.viewOutlet')} <ArrowRight size={14} /></Link>
        <a href={directionsHref} target="_blank" rel="noreferrer" aria-label={t('ui.vendor.getDirectionsTo', { outlet: location.name })} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 text-primary hover:bg-secondary"><Navigation size={16} /></a>
      </div>
    </div>
  </article>;
}

export default async function VendorBrandPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const result = await getVendor((await params).vendorId);
  if (!result) notFound();
  const { t } = await getServerTranslation('customer');
  const { vendor, locations, catalogue, featuredProducts, reviewSummary } = result;
  const vendorVisual = getVendorVisual({ name: vendor.name, coverUrl: vendor.cover_url, logoUrl: vendor.logo_url });
  const heroImage = vendorVisual.coverUrl;
  const vendorType = formatBusinessType(vendor.business_type, t);
  const hasMultipleLocations = locations.length > 1;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Organization', name: vendor.name, description: vendor.description, url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/customer/vendor/${vendor.id}` };

  return <main className="min-h-screen bg-background text-foreground">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <section className="relative isolate overflow-hidden bg-[#030052] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {heroImage && <img src={heroImage} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-35" />}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(255,210,31,.2),transparent_28%),linear-gradient(110deg,rgba(3,0,82,.98),rgba(3,0,82,.74))]" />
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_350px] lg:items-center lg:py-20">
         <div><div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#ffd21f]"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} /> {t('ui.labels.verifiedVendor')}</span><span className="h-1 w-1 rounded-full bg-white/50" /><span>{vendorType}</span></div><h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">{vendor.name}</h1>{vendor.description && <p className="mt-5 max-w-2xl text-base leading-7 text-white/80">{vendor.description}</p>}<div className="mt-8 flex flex-wrap items-center gap-3"><a href="#experiences" className="inline-flex items-center gap-2 rounded-xl bg-[#ffd21f] px-5 py-3 text-sm font-bold text-[#030052] transition hover:bg-white">{t('ui.vendor.featuredExperiences')} <ArrowRight size={16} /></a><a href="#locations" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"><MapPin size={16} /> {t('ui.labels.location')}</a><ShareButton shareType="vendor" contentId={vendor.id} title={vendor.name} /></div></div>
         {/* eslint-disable-next-line @next/next/no-img-element */}
         <div className="rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm"><div className="flex items-center gap-3 border-b border-white/15 pb-5">{vendorVisual.logoUrl ? <img src={vendorVisual.logoUrl} alt={t('ui.vendor.logoAlt', { vendor: vendor.name })} className="h-14 w-14 rounded-2xl bg-white object-cover p-1" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-black text-primary">{vendorVisual.initials}</div>}<div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ffd21f]">{t('ui.vendor.partnerProfile')}</p><p className="mt-1 font-bold">{t('ui.vendor.exploreWithConfidence')}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div><p className="text-2xl font-black">{locations.length}</p><p className="mt-1 text-xs text-white/65">{t('ui.vendor.activeLocations')}</p></div><div><p className="text-2xl font-black">{catalogue.length}</p><p className="mt-1 text-xs text-white/65">{t('ui.vendor.publishedListings')}</p></div></div></div>
      </div>
    </section>

     <section className="relative z-10 mx-auto -mt-8 max-w-6xl px-6"><div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-lg sm:grid-cols-2 lg:grid-cols-4"><div className="flex items-center gap-3 border-b border-border p-4 lg:border-b-0 lg:border-r"><CheckCircle2 className="shrink-0 text-emerald-600" size={20} /><div><p className="text-sm font-bold">{t('ui.labels.verifiedVendor')}</p><p className="text-xs text-muted-foreground">{t('ui.vendor.approvedOnMyWisata')}</p></div></div><div className="flex items-center gap-3 border-b border-border p-4 sm:border-l lg:border-b-0 lg:border-r"><MapPin className="shrink-0 text-primary" size={20} /><div><p className="text-sm font-bold">{t('ui.vendor.locationCount', { count: locations.length })}</p><p className="text-xs text-muted-foreground">{t('ui.vendor.acrossMalaysia')}</p></div></div><div className="flex items-center gap-3 border-b border-border p-4 lg:border-b-0 lg:border-r"><Sparkles className="shrink-0 text-amber-600" size={20} /><div><p className="text-sm font-bold">{t('ui.vendor.listingCount', { count: catalogue.length })}</p><p className="text-xs text-muted-foreground">{t('ui.vendor.readyToExplore')}</p></div></div><div className="flex items-center gap-3 p-4 sm:border-l">{reviewSummary.rating !== null ? <Star className="shrink-0 text-amber-500" size={20} fill="currentColor" /> : <ShieldCheck className="shrink-0 text-muted-foreground/50" size={20} />}<div><p className="text-sm font-bold">{reviewSummary.rating !== null ? `${reviewSummary.rating.toFixed(1)} / 5` : t('ui.vendor.newPartner')}</p><p className="text-xs text-muted-foreground">{reviewSummary.reviews > 0 ? t('ui.vendor.travellerReviewCount', { count: reviewSummary.reviews }) : t('ui.vendor.reviewsAppearHere')}</p></div></div></div></section>

    <div className="mx-auto max-w-6xl space-y-16 px-6 py-16">
        <section id="experiences" aria-labelledby="experiences-heading"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.featuredExperiences')}</p><h2 id="experiences-heading" className="mt-2 text-3xl font-black tracking-tight">{t('ui.vendor.memorableDay')}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t('ui.vendor.experienceDescription')}</p></div><span className="text-sm font-semibold text-muted-foreground">{t('ui.vendor.publishedListingCount', { count: catalogue.length })}</span></div>{featuredProducts.length ? <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{featuredProducts.map((product) => <ProductCard key={product.id} product={product} vendorId={vendor.id} t={t} />)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.vendor.noExperiences')}</div>}</section>

       <section id="locations" aria-labelledby="locations-heading">
         <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
           <div>
             <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.findAcrossMalaysia')}</p>
             <h2 id="locations-heading" className="mt-2 text-3xl font-black tracking-tight">{t('ui.vendor.chooseLocationTitle')}</h2>
             <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t('ui.vendor.chooseLocationDescription')}</p>
           </div>
           {hasMultipleLocations && <span className="text-sm font-semibold text-muted-foreground">{t('ui.vendor.activeOutletCount', { count: locations.length })}</span>}
         </div>
         {locations.length ? hasMultipleLocations ? (
           <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
             {locations.map((location) => <LocationCard key={location.id} location={location} vendorId={vendor.id} t={t} />)}
           </div>
         ) : (
           <div className="mt-6 max-w-3xl">
             <SingleLocationSummary location={locations[0]} vendorId={vendor.id} t={t} />
           </div>
         ) : <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.vendor.noPublicOutlets')}</div>}
       </section>

       <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]" aria-label={t('ui.vendor.information')}><div className="rounded-2xl border border-border bg-card p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.about')}</p><h2 className="mt-2 text-2xl font-black">{t('ui.vendor.localPartnerTitle')}</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">{vendor.description || t('ui.vendor.fallbackDescription', { vendor: vendor.name })}</p><div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{t('ui.vendor.verifiedBusiness')}</span><span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{vendorType}</span><span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{t('ui.vendor.bookThrough')}</span></div></div><div className="rounded-2xl border border-border bg-card p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.policiesSupport')}</p><h2 className="mt-2 text-2xl font-black">{t('ui.vendor.planDetails')}</h2><div className="mt-5 space-y-4"><div className="flex gap-3"><Clock3 className="mt-0.5 shrink-0 text-primary" size={18} /><p className="text-sm leading-6 text-muted-foreground"><strong className="text-foreground">{t('ui.vendor.hoursVary')}</strong> {t('ui.vendor.checkSchedule')}</p></div><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} /><p className="text-sm leading-6 text-muted-foreground"><strong className="text-foreground">{t('ui.vendor.bookingDetailsClear')}</strong> {t('ui.vendor.productPageDetails')}</p></div></div><a href="#locations" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">{t('ui.labels.chooseOutlet')} <ArrowRight size={15} /></a></div></section>

      {reviewSummary.reviews > 0 && <section aria-labelledby="reviews-heading" className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">{t('ui.vendor.travellerFavourites')}</p><h2 id="reviews-heading" className="mt-2 text-2xl font-black">{t('ui.vendor.trustedByTravellers')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('ui.vendor.combinedScore')}</p></div><div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3"><Star size={24} fill="currentColor" className="text-amber-500" /><div><p className="text-2xl font-black text-foreground">{reviewSummary.rating?.toFixed(1)} <span className="text-sm font-semibold text-muted-foreground">/ 5</span></p><p className="text-xs text-muted-foreground">{t('ui.vendor.reviewCount', { count: reviewSummary.reviews })}</p></div></div></div></section>}
    </div>
  </main>;
}
