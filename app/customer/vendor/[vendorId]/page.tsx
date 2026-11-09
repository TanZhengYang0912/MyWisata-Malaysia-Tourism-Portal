import type { Metadata } from 'next';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArrowRight, CheckCircle2, Clock3, ShieldCheck, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ShareButton } from '@/components/shared/share-button';
import { ReferencePrice } from "@/components/shared/reference-price";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { VendorListingGrid } from "@/components/customer/vendor-listing-grid";
import { VendorLocationList, type VendorLocationRow } from "@/components/customer/vendor-location-list";
import { VendorOperatingHours } from "@/components/customer/vendor-operating-hours";
import { VendorSectionNav } from "@/components/customer/vendor-section-nav";
import { selectFeaturedVendorProducts } from '@/lib/customer/vendor-page';
import { getVendorVisual } from '@/lib/customer/vendor-visual';
import { resolveOutletImage, type ManagedPlaceImage } from '@/lib/outlet-images';
import { productImageUrl } from '@/lib/storage/product-image';
import { getServerTranslation } from '@/lib/i18n/server';
import type { OperatingHours } from '@/backend/core/types';
import { getReviewRatingSummary, getScopeRatingSummaries, getScopedReviewPage } from '@/backend/domains/vendor-reviews';
import { VendorReviewsList } from '@/components/customer/vendor-reviews-list';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';
import { MediaGallery } from '@/components/customer/media-gallery';
import { selectEntityGallery, selectEntityLogo, type EntityMediaRow } from '@/lib/customer/entity-media';
import type { GalleryItem } from '@/lib/vendor/outlet-page-schema';
import { EventItemsTable } from '@/components/customer/event-items-table';
import { getMalaysiaDateInputValue } from '@/lib/datetime/date-input';
import { getPublicPromotionCampaigns } from '@/lib/promotion-campaigns/public';
import { vendorEventItems } from '@/lib/promotion-campaigns/vendor-events';
import { serializeJsonLd } from '@/lib/seo/json-ld';

export const dynamic = 'force-dynamic';

type OutletRecord = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  operatingHours: OperatingHours | null;
  coverUrl: string | null;
  logoUrl: string | null;
  gallery: GalleryItem[];
};

type OutletOffer = { outlet_id: string; price: number; status: string };

type CatalogueProduct = {
  id: string;
  name: string;
  productType: string | null;
  requiresBooking: boolean;
  coverUrl: string | null;
  fromPrice: number;
  soldAt: Array<{ id: string; name: string; price: number }>;
  rating: number;
  reviews: number;
};

function formatBusinessType(value: string | null, t: TFunction) {
  if (!value) return t('ui.vendor.localExperiencePartner');
  const key = `ui.vendor.businessTypes.${value.replace(/-/g, '_')}`;
  const translated = t(key);
  return translated === key ? value.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' & ') : translated;
}

async function getVendor(vendorId: string) {
  const db = await createClient();
  type VendorDetail = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    cover_url: string | null;
    business_type: string | null;
    featured_product_ids?: string[] | null;
    /** 'event' vendors sell only at events and are shown as event partners. */
    kind?: 'shop' | 'event';
  };

  let vendor: VendorDetail | null = null;

  const { data: vendorWithFeatured, error: featuredErr } = await db
    .from('vendors')
    .select('id,name,slug,description,logo_url,cover_url,business_type,featured_product_ids,kind')
    .eq('id', vendorId)
    .eq('status', 'approved')
    .maybeSingle();

  if (featuredErr || !vendorWithFeatured) {
    const { data: standardVendor } = await db
      .from('vendors')
      .select('id,name,slug,description,logo_url,cover_url,business_type,kind')
      .eq('id', vendorId)
      .eq('status', 'approved')
      .maybeSingle();
    vendor = (standardVendor as unknown as VendorDetail) || null;
  } else {
    vendor = (vendorWithFeatured as unknown as VendorDetail) || null;
  }
  if (!vendor) return null;

  const [{ data: outlets }, { data: products }, { data: managedPlaces }] = await Promise.all([
    db.from('outlets').select('id,name,city,state,address,lat,lng,operating_hours,outlet_pages(hero_url)').eq('vendor_id', vendorId).eq('status', 'active').eq('review_status', 'approved').order('name'),
    db.from('products').select('id,name,product_type,requires_booking,base_price,cover_url,outlet_id,tags,outlet_offers(outlet_id,price,status)').eq('vendor_id', vendorId).eq('status', 'active').eq('review_status', 'approved').order('name'),
    db.from('places').select('name,image_url').eq('managed_by_vendor_id', vendorId).eq('level', 'poi').eq('status', 'active'),
  ]);

  const outletIds = (outlets ?? []).map((outlet) => outlet.id);
  const [{ data: vendorMedia }, { data: outletMedia }] = await Promise.all([
    db.from('media_assets').select('url,alt_text,media_type,sort_order').eq('vendor_id', vendorId).is('outlet_id', null).is('product_id', null).order('sort_order'),
    outletIds.length
      ? db.from('media_assets').select('outlet_id,url,alt_text,media_type,sort_order').in('outlet_id', outletIds).is('product_id', null).order('sort_order')
      : Promise.resolve({ data: [] as Array<{ outlet_id: string; url: string; alt_text: string | null; media_type: string | null; sort_order: number | null }> }),
  ]);

  const toMediaRows = (rows: unknown): EntityMediaRow[] => (Array.isArray(rows) ? rows : []).map((row) => {
    const value = row as { url?: string; alt_text?: string | null; media_type?: string | null; sort_order?: number | null };
    return { url: value.url || '', altText: value.alt_text, mediaType: value.media_type, sortOrder: value.sort_order };
  });
  const vendorGallery = selectEntityGallery(toMediaRows(vendorMedia), 3);
  const outletMediaById = new Map<string, EntityMediaRow[]>();
  for (const row of outletMedia ?? []) {
    const current = outletMediaById.get(row.outlet_id) ?? [];
    current.push({ url: row.url, altText: row.alt_text, mediaType: row.media_type, sortOrder: row.sort_order });
    outletMediaById.set(row.outlet_id, current);
  }

  const managedPlaceImages = (managedPlaces ?? []).map((place) => ({ name: place.name, imageUrl: place.image_url })) as ManagedPlaceImage[];
  const outletRows = (outlets ?? []).map((outlet) => {
    const outletPage = Array.isArray(outlet.outlet_pages) ? outlet.outlet_pages[0] : outlet.outlet_pages;
    const mediaRows = outletMediaById.get(outlet.id) ?? [];
    const gallery = selectEntityGallery(mediaRows, 3);
    const safeGallery = gallery.length ? gallery : selectEntityGallery(mediaRows);
    return { ...outlet, operatingHours: outlet.operating_hours as OperatingHours | null, logoUrl: selectEntityLogo(mediaRows), gallery: safeGallery, coverUrl: safeGallery[0]?.url ?? resolveOutletImage({ outletName: outlet.name, outletHeroUrl: outletPage?.hero_url, managedPlaceImages }) };
  }) as OutletRecord[];
  const outletNames = new Map(outletRows.map((outlet) => [outlet.id, outlet.name]));
  const productRows = products ?? [];
  const metricRows = productRows.length
    ? (await db.from('product_review_metrics').select('product_id,rating,reviews').in('product_id', productRows.map((product) => product.id))).data ?? []
    : [];
  const reviewMetrics = new Map((metricRows as { product_id: string; rating: number | string; reviews: number | string }[]).map((row) => [row.product_id, { rating: Number(row.rating), reviews: Number(row.reviews) }]));

  const catalogue = productRows.map((product) => {
    const offers = ((product.outlet_offers ?? []) as OutletOffer[]).filter((offer) => offer.status === 'active' && outletNames.has(offer.outlet_id) && offer.price != null && Number.isFinite(Number(offer.price)) && Number(offer.price) >= 0);
    const soldAt = offers.length
      ? offers.map((offer) => ({ id: offer.outlet_id, name: outletNames.get(offer.outlet_id)!, price: Number(offer.price) }))
      : product.outlet_id && outletNames.has(product.outlet_id) && product.base_price != null && Number.isFinite(Number(product.base_price)) && Number(product.base_price) >= 0
        ? [{ id: product.outlet_id, name: outletNames.get(product.outlet_id)!, price: Number(product.base_price) }]
        : [];
    const metric = reviewMetrics.get(product.id) ?? { rating: 0, reviews: 0 };
    return {
      id: product.id,
      name: product.name,
      productType: product.product_type as string | null,
      requiresBooking: Boolean(product.requires_booking),
      coverUrl: productImageUrl(product.cover_url as string | null),
      fromPrice: soldAt.length ? Math.min(...soldAt.map((entry) => entry.price)) : Number(product.base_price),
      soldAt,
      rating: metric.rating,
      reviews: metric.reviews,
    } satisfies CatalogueProduct;
  }).filter((product) => product.soldAt.length > 0);

  const locations = outletRows;

  // Resolve vendor owner's chosen featured products
  const explicitFeaturedIds: string[] = Array.isArray(vendor.featured_product_ids) && vendor.featured_product_ids.length > 0
    ? vendor.featured_product_ids
    : productRows
      .filter((product) => Array.isArray(product.tags) && product.tags.some((tag: unknown) => tag === 'featured'))
      .map((product) => product.id);

  // The whole listing, featured products first and the rest by name.
  const featured = selectFeaturedVendorProducts(catalogue, catalogue.length, explicitFeaturedIds);
  const featuredIds = new Set(featured.map((product) => product.id));

  const [reviewPage, reviewSummary, outletRatings] = await Promise.all([
    getScopedReviewPage("vendor", vendorId, { page: 1, pageSize: 6 }, db),
    getReviewRatingSummary("vendor", vendorId, createServiceClient()),
    // One batched lookup for the location cards; outlets without reviews show none.
    getScopeRatingSummaries("outlet", locations.map((location) => location.id), createServiceClient()).catch(() => null),
  ]);

  return {
    vendor,
    vendorGallery,
    locations,
    catalogue,
    listing: [...featured, ...catalogue.filter((product) => !featuredIds.has(product.id)).sort((left, right) => left.name.localeCompare(right.name))],
    outletRatings,
    reviewSummary: { rating: reviewSummary.total ? reviewSummary.rating : null, reviews: reviewSummary.total },
    reviews: reviewPage.items,
    reviewRatingBuckets: reviewSummary.buckets,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ vendorId: string }> }): Promise<Metadata> {
  const { vendorId } = await params;
  const result = await getVendor(vendorId);
  const { t } = await getServerTranslation('customer');
  if (!result) return { title: t('ui.vendor.notFound') };
  const vendorVisual = getVendorVisual({ name: result.vendor.name, coverUrl: result.vendor.cover_url, logoUrl: result.vendor.logo_url });
  const baseDescription = result.vendor.description ?? t('ui.vendor.metadataDescription', { vendor: result.vendor.name });
  // Rating prefix for the WhatsApp/social preview card — reuses the exact
  // same weighted rating the page itself displays, never a fabricated
  // number (result.reviewSummary.rating is null with zero reviews).
  const description = result.reviewSummary.rating !== null ? `★ ${result.reviewSummary.rating.toFixed(1)} · ${baseDescription}` : baseDescription;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/customer/vendors/${vendorId}`;
  return { title: `${result.vendor.name} | ${BRAND_NAME}`, description, openGraph: { title: result.vendor.name, description, url, images: vendorVisual.coverUrl ? [{ url: vendorVisual.coverUrl }] : undefined } };
}

// Section targets land just below the customer header and the sticky section nav.
const sectionScroll = 'scroll-mt-[calc(var(--customer-header-h,4.25rem)+56px)]';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 bg-card px-[18px] py-4">
    <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    {children}
  </div>;
}

export default async function VendorBrandPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const [result, publicEvents] = await Promise.all([getVendor((await params).vendorId), getPublicPromotionCampaigns()]);
  if (!result) notFound();
  const { t } = await getServerTranslation('customer');
  const { vendor, vendorGallery, locations, catalogue, listing, outletRatings, reviewSummary, reviews, reviewRatingBuckets } = result;
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const vendorVisual = getVendorVisual({ name: vendor.name, coverUrl: vendor.cover_url, logoUrl: vendor.logo_url });
  const heroImage = vendorVisual.coverUrl;
  const visibleVendorGallery = vendorGallery.filter((item) => item.url !== heroImage);
  const vendorType = formatBusinessType(vendor.business_type, t);
  const hasMultipleLocations = locations.length > 1;
  const isEventVendor = vendor.kind === 'event';
  const eventItems = vendorEventItems(publicEvents.campaigns, vendor.id, getMalaysiaDateInputValue());
  const showEventItems = isEventVendor || eventItems.length > 0;
  const hoursSource = locations.find((location) => location.operatingHours)?.operatingHours ?? null;
  const lowestPrice = catalogue.length ? Math.min(...catalogue.map((product) => product.fromPrice)) : null;
  const listingCards = listing.map((product) => ({
    ...product, vendorId: vendor.id, imageUrl: product.coverUrl, description: null,
    soldAt: product.soldAt.map((entry) => {
      const outlet = locationsById.get(entry.id);
      // Only a single-outlet card reads the hours (its Closed badge and hours summary).
      return { ...entry, city: outlet?.city ?? null, state: outlet?.state ?? null, operatingHours: product.soldAt.length === 1 ? outlet?.operatingHours ?? null : null };
    }),
  }));
  const locationRows: VendorLocationRow[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    vendorName: vendor.name,
    city: location.city,
    state: location.state,
    imageUrl: location.coverUrl ?? vendorVisual.coverUrl,
    rating: outletRatings ? outletRatings.get(location.id) ?? null : undefined,
    operatingHours: location.operatingHours,
    href: `/customer/outlets/${location.id}`,
  }));
  const sectionNavItems = [
    showEventItems && { id: 'event-items', label: t('ui.vendor.eventItems.title') },
    !isEventVendor && { id: 'experiences', label: t('ui.vendor.featuredExperiences') },
    !isEventVendor && { id: 'locations', label: t('ui.labels.locations') },
    { id: 'about', label: t('ui.vendor.about') },
    reviewSummary.reviews > 0 && { id: 'reviews', label: t('ui.vendor.reviewsNav', { count: reviewSummary.reviews }) },
  ].filter((item): item is { id: string; label: string } => Boolean(item));
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Organization', name: vendor.name, description: vendor.description, url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/customer/vendors/${vendor.id}` };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8"><Breadcrumbs label={t('ui.place.breadcrumb')} items={[
      { label: t('navigation.home'), href: '/customer' },
      { label: t('navigation.search'), href: '/customer/vendors' },
      { label: vendor.name },
    ]} /></div>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

    {/* Header: eyebrow, name and badge, with Share as the only action. */}
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">{t('ui.vendor.partnerProfile')}</p>
          <h1 className="mt-1 break-words font-[family-name:var(--font-display)] text-[26px] font-bold leading-[1.15] text-foreground sm:text-[34px]">{vendor.name}</h1>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">
            <CheckCircle2 size={14} aria-hidden="true" />
            {isEventVendor ? t('ui.vendor.eventItems.eventPartner') : t('ui.labels.verifiedVendor')}
          </span>
        </div>
        <ShareButton shareType="vendor" contentId={vendor.id} title={vendor.name} />
      </div>
    </div>

    {/* Hero: the cover image only. */}
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
      <section
        aria-label={vendor.name}
        className="relative h-[200px] overflow-hidden rounded-[18px] border border-border bg-primary sm:h-[300px] sm:rounded-[24px]"
        style={heroImage ? { backgroundImage: `url(${heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {!heroImage && <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-slate-900" aria-hidden="true" />}
        {visibleVendorGallery.length > 0 && <a href="#gallery" className="absolute bottom-3.5 right-3.5 rounded-full bg-black/65 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">{t('ui.vendor.viewPhotos')}</a>}
      </section>
    </div>

    <div className="outlet-public-content mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      {!isEventVendor && <section className="relative z-10 mx-2.5 -mt-[26px] mb-6 overflow-hidden rounded-[20px] border border-border bg-border shadow-lg sm:mx-[22px] sm:-mt-[38px]" aria-label={t('ui.vendor.information')}>
        <div className="grid gap-px min-[600px]:grid-cols-2 min-[900px]:grid-cols-[1fr_1.4fr_1fr_1fr]">
          <Fact label={t('ui.labels.location')}>
            <p className="mt-1 break-words text-sm font-bold text-foreground">
              {hasMultipleLocations ? t('ui.vendor.acrossMalaysia') : [locations[0]?.city, locations[0]?.state].filter(Boolean).join(', ') || t('ui.labels.malaysia')}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('ui.vendor.locationCount', { count: locations.length })}</p>
          </Fact>
          <Fact label={t('ui.labels.operatingHours')}>
            <VendorOperatingHours hours={hoursSource} />
          </Fact>
          <Fact label={t('ui.vendor.featuredExperiences')}>
            <p className="mt-1 text-sm font-bold text-foreground">{t('ui.vendor.listingCount', { count: catalogue.length })}</p>
            {lowestPrice !== null && <p className="mt-0.5 text-xs text-muted-foreground">{t('ui.vendor.from')} <ReferencePrice amountMYR={lowestPrice} /></p>}
          </Fact>
          <Fact label={reviewSummary.rating !== null ? t('ui.vendor.travellerFavourites') : t('ui.labels.verifiedVendor')}>
            <p className="mt-1 flex items-center gap-1 text-sm font-bold text-foreground">
              {reviewSummary.rating !== null && <Star size={14} className="text-amber-500" fill="currentColor" aria-hidden="true" />}
              {reviewSummary.rating !== null ? `${reviewSummary.rating.toFixed(1)} / 5` : t('ui.labels.verifiedVendor')}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {reviewSummary.reviews > 0 ? t('ui.vendor.travellerReviewCount', { count: reviewSummary.reviews }) : t('ui.vendor.approvedOnMyLawatan')}
            </p>
          </Fact>
        </div>
      </section>}

      <div className={isEventVendor ? 'mt-6' : undefined}>
        <VendorSectionNav items={sectionNavItems} />
      </div>

      {visibleVendorGallery.length > 0 && <div id="gallery" className={`mb-8 ${sectionScroll}`}>
        <MediaGallery items={visibleVendorGallery} label={t('ui.vendor.galleryLabel', { vendor: vendor.name })} previousLabel={t('ui.vendor.previousGallery')} nextLabel={t('ui.vendor.nextGallery')} slideLabel={t('ui.vendor.gallerySlide')} roleDescription={t('ui.accessibility.carousel')} />
      </div>}

      {/* Content Sections */}
      <div className="space-y-12 sm:space-y-16">
        {showEventItems && (
          <section id="event-items" aria-labelledby="event-items-heading" className={sectionScroll}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.eventItems.eyebrow')}</p>
            <h2 id="event-items-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t('ui.vendor.eventItems.title')}</h2>
            <p className="mb-4 mt-2 max-w-2xl text-sm leading-5 text-muted-foreground sm:mb-6 sm:leading-6">{t('ui.vendor.eventItems.description')}</p>
            <EventItemsTable items={eventItems} />
          </section>
        )}

        {!isEventVendor && <>
        <section id="experiences" aria-labelledby="experiences-heading" className={sectionScroll}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.featuredExperiences')}</p>
          <h2 id="experiences-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t('ui.vendor.memorableDay')}</h2>
          {listingCards.length ? (
            <VendorListingGrid products={listingCards} vendorName={vendor.name} returnTo={`/customer/vendors/${vendor.id}`} />
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.vendor.noExperiences')}</div>
          )}
        </section>

        <section id="locations" aria-labelledby="locations-heading" className={sectionScroll}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.findAcrossMalaysia')}</p>
              <h2 id="locations-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t('ui.vendor.chooseLocationTitle')}</h2>
            </div>
          </div>
          {locations.length ? <VendorLocationList locations={locationRows} /> : <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.vendor.noPublicOutlets')}</div>}
        </section>
        </>}

        <section className={`grid gap-6 ${isEventVendor ? '' : 'min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]'}`} aria-label={t('ui.vendor.information')}>
          <div id="about" className={`rounded-2xl border border-border bg-card p-6 shadow-sm ${sectionScroll}`}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.about')}</p>
            <h2 className="mt-2 text-2xl font-black">{t('ui.vendor.localPartnerTitle')}</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{vendor.description || t('ui.vendor.fallbackDescription', { vendor: vendor.name })}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{t('ui.vendor.verifiedBusiness')}</span>
              <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{vendorType}</span>
              <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{t('ui.vendor.bookThrough')}</span>
            </div>
          </div>
          {!isEventVendor && <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendor.policiesSupport')}</p>
            <h2 className="mt-2 text-2xl font-black">{t('ui.vendor.planDetails')}</h2>
            <div className="mt-5 space-y-4">
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 shrink-0 text-primary" size={18} />
                <p className="text-sm leading-6 text-muted-foreground">
                  <strong className="text-foreground">{t('ui.vendor.hoursVary')}</strong> {t('ui.vendor.checkSchedule')}
                </p>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} />
                <p className="text-sm leading-6 text-muted-foreground">
                  <strong className="text-foreground">{t('ui.vendor.bookingDetailsClear')}</strong> {t('ui.vendor.productPageDetails')}
                </p>
              </div>
            </div>
            <a href="#locations" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
              {t('ui.labels.chooseOutlet')} <ArrowRight size={15} />
            </a>
          </div>}
        </section>

        {reviewSummary.reviews > 0 && (
          <section id="reviews" aria-labelledby="reviews-heading" className={`rounded-2xl border border-border bg-card p-6 shadow-sm ${sectionScroll}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">{t('ui.vendor.travellerFavourites')}</p>
                <h2 id="reviews-heading" className="mt-2 text-2xl font-black">{t('ui.vendor.trustedByTravellers')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t('ui.vendor.combinedScore')}</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3">
                <Star size={24} fill="currentColor" className="text-amber-500" />
                <div>
                  <p className="text-2xl font-black text-foreground">{reviewSummary.rating?.toFixed(1)} <span className="text-sm font-semibold text-muted-foreground">/ 5</span></p>
                  <p className="text-xs text-muted-foreground">{t('ui.vendor.reviewCount', { count: reviewSummary.reviews })}</p>
                </div>
              </div>
            </div>

            <VendorReviewsList reviews={reviews} ratingBuckets={reviewRatingBuckets} totalReviews={reviewSummary.reviews} vendorId={vendor.id} />
          </section>
        )}
      </div>
    </div>
  </main>;
}
