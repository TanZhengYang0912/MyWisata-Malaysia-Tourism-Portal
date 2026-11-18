/**
 * Server-only cached wrappers for public catalogue data.
 *
 * Import these in Server Components and API routes instead of calling
 * getActivities() / getOutlets() directly, so that multiple requests
 * within the same revalidation window share a single DB round-trip.
 *
 * Uses the service-role client (no cookies) so that unstable_cache can
 * execute without hitting Next.js's "dynamic data source inside cache"
 * restriction. Catalogue data is public — RLS does not filter it by user.
 *
 * IMPORTANT: Only import from server-side code (Server Components, API
 * routes, Server Actions). Never import from client components.
 */
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import {
  applyDiscoveryReviewMetrics,
  computeDiscoveryActivities,
  getActivities,
  getComputedActivity,
  getDiscoveryOutletIds,
  getDiscoveryOutletsByIds,
  getDiscoveryProductActivities,
  getDiscoveryReviewMetricEntries,
  getOutletChoices,
  getOutlets,
  getProductReviews,
} from '@/backend/domains/catalogue';
import type { Activity, ComputedActivity, Outlet } from '@/backend/core/types';
import type { DiscoveryActivityData } from '@/backend/domains/catalogue';
import { getReviewRatingSummary, getScopeRatingSummaries, getScopedReviewPage, getVendorRatingSummaries } from '@/backend/domains/vendor-reviews';

/**
 * Cached getActivities — revalidates every 60 seconds.
 * Returns raw Activity[] — suitable for catalogue maps (e.g. checkout prepare).
 */
export const getCachedActivities: () => Promise<Activity[]> = unstable_cache(
  async () => {
    const db = createServiceClient();
    return getActivities(db);
  },
  ['catalogue-activities'],
  { revalidate: 60, tags: ['activities'] },
);

const getCachedDiscoveryProductActivities = unstable_cache(
  async () => {
    const db = createServiceClient();
    return getDiscoveryProductActivities(db);
  },
  ['catalogue-discovery-products'],
  { revalidate: 60, tags: ['activities'] },
);

const getCachedDiscoveryRelatedData = unstable_cache(
  async (productIds: string[], outletIds: string[]) => {
    const db = createServiceClient();
    // Keep catalogue refreshes within the bounded query concurrency used by
    // the discovery loaders: each helper batches internally, so run them in turn.
    const metrics = await getDiscoveryReviewMetricEntries(productIds, db);
    const outlets = await getDiscoveryOutletsByIds(outletIds, db);
    return { metrics, outlets };
  },
  ['catalogue-discovery-related-data'],
  { revalidate: 60, tags: ['activities', 'outlets'] },
);

/**
 * Assemble the public discovery shape outside the cache. Keeping the products,
 * review metrics, and shared outlet records in separate entries avoids storing
 * the same outlet metadata once for every product card.
 */
export async function getCachedDiscoveryActivityData(): Promise<DiscoveryActivityData> {
  const activities = await getCachedDiscoveryProductActivities();
  if (activities.length === 0) return { activities: [], outlets: [] };

  const productIds = [...new Set(activities.map((activity) => activity.id))].sort();
  const outletIds = getDiscoveryOutletIds(activities);
  const { metrics, outlets } = await getCachedDiscoveryRelatedData(productIds, outletIds);

  return { activities: applyDiscoveryReviewMetrics(activities, metrics), outlets };
}

export async function getCachedComputedActivities(): Promise<ComputedActivity[]> {
  return computeDiscoveryActivities(await getCachedDiscoveryActivityData());
}

/**
 * Cached getOutlets — revalidates every 60 seconds.
 */
export const getCachedOutlets: () => Promise<Outlet[]> = unstable_cache(
  async () => {
    const db = createServiceClient();
    return getOutlets(db);
  },
  ['catalogue-outlets'],
  { revalidate: 60, tags: ['outlets'] },
);

/**
 * Public Home reads: the same rows for every visitor (both RPCs are
 * caller-independent SECURITY DEFINER projections), so they may be up to 60 s
 * stale. A failed read throws instead of being cached, so the next request
 * retries it. Time windows (placement start/end, campaign end) are still
 * re-checked on every request by the Home ranking helpers.
 */
function cachedPublicRead<Args extends unknown[], Data>(
  key: string,
  read: (db: SupabaseClient, ...args: Args) => PromiseLike<{ data: Data | null; error: unknown }>,
) {
  return unstable_cache(async (...args: Args) => {
    const { data, error } = await read(createServiceClient(), ...args);
    if (error) throw error;
    return data;
  }, [key], { revalidate: 60 });
}

export const getCachedPublicPromotionCampaigns = cachedPublicRead('home-promotion-campaigns',
  (db) => db.rpc('get_public_promotion_campaigns', { p_slug: null }));

export const getCachedSponsoredPlacements = cachedPublicRead('home-sponsored-placements',
  (db) => db.rpc('list_active_sponsored_discovery_placements'));

export const getCachedHomeVendors = cachedPublicRead('home-vendors', (db) => db
  .from('vendors')
  .select('id,name,description,logo_url,cover_url,business_type,outlets(id,name,city,state,status,review_status,operating_hours)')
  .eq('status', 'approved')
  .eq('kind', 'shop')
  .order('name')
  .limit(24));

/** Vendor-level media for the given vendor IDs; pass them sorted so equal sets share one entry. */
export const getCachedVendorMedia = cachedPublicRead('home-vendor-media', (db, vendorIds: string[]) => db
  .from('media_assets')
  .select('vendor_id,url,alt_text,media_type,sort_order')
  .in('vendor_id', vendorIds)
  .is('outlet_id', null)
  .is('product_id', null)
  .order('sort_order'));

export const getCachedEventPartnerVendors = cachedPublicRead('home-event-partner-vendors', (db, vendorIds: string[]) => db
  .from('vendors')
  .select('id,name,description,logo_url,cover_url')
  .eq('status', 'approved')
  .in('id', vendorIds));

/** Ratings as [vendorId, summary] entries: a Map would not survive cache serialisation. */
export const getCachedVendorRatings = unstable_cache(
  async (vendorIds: string[]) => [...await getVendorRatingSummaries(vendorIds, createServiceClient())],
  ['home-vendor-ratings'],
  { revalidate: 60 },
);

/** Outlet ratings as [outletId, summary] entries; pass the ids sorted so equal sets share one entry. */
export const getCachedOutletRatings = unstable_cache(
  async (outletIds: string[]) => [...await getScopeRatingSummaries('outlet', outletIds, createServiceClient())],
  ['public-outlet-ratings'],
  { revalidate: 60 },
);

/*
 * Public detail pages (vendor and product). These reads use the service client, which skips RLS, so every query
 * repeats the guest policy as explicit filters: approved vendors, active approved outlets and products, active
 * places, entity media of those approved rows only, and visible reviews. Nothing per-user enters these entries;
 * live booking availability is never cached here.
 * Plan: docs/plans/2026-11-18-2330-fast-public-detail-pages.md
 */

const MISSING_PUBLIC_ENTITY = 'public-entity-missing';

/** Thrown inside the cache for an unknown id so it is not stored: arbitrary ids would otherwise each add an entry. */
class MissingPublicEntity extends Error {
  constructor() {
    super(MISSING_PUBLIC_ENTITY);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cachedPublicEntity<Args extends Array<string | undefined>, Data>(
  key: string,
  read: (db: SupabaseClient, id: string, ...rest: Args) => Promise<Data | null>,
  tags: string[],
) {
  const cached = unstable_cache(async (id: string, ...rest: Args) => {
    const data = await read(createServiceClient(), id, ...rest);
    if (data === null) throw new MissingPublicEntity();
    return data;
  }, [key], { revalidate: 60, tags });
  return async (id: string, ...rest: Args): Promise<Data | null> => {
    // A malformed id is a database error; treat it as not found without querying.
    if (!UUID.test(id)) return null;
    try {
      return await cached(id, ...rest);
    } catch (error) {
      if (error instanceof MissingPublicEntity || (error instanceof Error && error.message === MISSING_PUBLIC_ENTITY)) return null;
      throw error;
    }
  };
}

type PublicVendorRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  business_type: string | null;
  featured_product_ids?: string[] | null;
  kind?: 'shop' | 'event';
};

/** Throws a failed read so the cache never stores a partial page. */
function rowsOrThrow<Row>(result: { data: unknown; error: unknown }): Row[] {
  if (result.error) throw result.error;
  return (result.data ?? []) as Row[];
}

async function readPublicVendorPage(db: SupabaseClient, vendorId: string) {
  const vendorQuery = (columns: string) => db.from('vendors').select(columns).eq('id', vendorId).eq('status', 'approved').maybeSingle();
  // Everything except outlet media and product metrics needs only the vendor id, so it runs in one round.
  const [vendorResult, outletsResult, productsResult, placesResult, vendorMediaResult, reviewPage, reviewSummary] = await Promise.all([
    vendorQuery('id,name,slug,description,logo_url,cover_url,business_type,featured_product_ids,kind'),
    db.from('outlets').select('id,name,city,state,address,lat,lng,operating_hours,outlet_pages(hero_url)').eq('vendor_id', vendorId).eq('status', 'active').eq('review_status', 'approved').order('name'),
    db.from('products').select('id,name,product_type,requires_booking,base_price,cover_url,outlet_id,tags,outlet_offers(outlet_id,price,status)').eq('vendor_id', vendorId).eq('status', 'active').eq('review_status', 'approved').order('name'),
    db.from('places').select('name,image_url').eq('managed_by_vendor_id', vendorId).eq('level', 'poi').eq('status', 'active'),
    db.from('media_assets').select('url,alt_text,media_type,sort_order').eq('vendor_id', vendorId).is('outlet_id', null).is('product_id', null).order('sort_order'),
    getScopedReviewPage('vendor', vendorId, { page: 1, pageSize: 6 }, db),
    getReviewRatingSummary('vendor', vendorId, db),
  ]);
  // Older schemas lack featured_product_ids; read the vendor without it.
  const vendorRow = vendorResult.error ? await vendorQuery('id,name,slug,description,logo_url,cover_url,business_type,kind') : vendorResult;
  if (vendorRow.error) throw vendorRow.error;
  const vendor = vendorRow.data as unknown as PublicVendorRow | null;
  if (!vendor) return null;

  const outlets = rowsOrThrow<{ id: string; name: string; city: string | null; state: string | null; address: string | null; lat: number | null; lng: number | null; operating_hours: unknown; outlet_pages: { hero_url: string | null } | { hero_url: string | null }[] | null }>(outletsResult);
  const products = rowsOrThrow<{ id: string; name: string; product_type: string | null; requires_booking: boolean | null; base_price: number | string | null; cover_url: string | null; outlet_id: string | null; tags: unknown; outlet_offers: unknown }>(productsResult);
  const outletIds = outlets.map((outlet) => outlet.id);
  const productIds = products.map((product) => product.id);
  const [outletMediaResult, metricsResult] = await Promise.all([
    // Limited to this vendor's active, approved outlets, which is what the guest media policy allows.
    outletIds.length
      ? db.from('media_assets').select('outlet_id,url,alt_text,media_type,sort_order').in('outlet_id', outletIds).is('product_id', null).order('sort_order')
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? db.from('product_review_metrics').select('product_id,rating,reviews').in('product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    vendor,
    outlets,
    products,
    managedPlaces: rowsOrThrow<{ name: string; image_url: string | null }>(placesResult),
    vendorMedia: rowsOrThrow<{ url: string; alt_text: string | null; media_type: string | null; sort_order: number | null }>(vendorMediaResult),
    outletMedia: rowsOrThrow<{ outlet_id: string; url: string; alt_text: string | null; media_type: string | null; sort_order: number | null }>(outletMediaResult),
    metricRows: rowsOrThrow<{ product_id: string; rating: number | string; reviews: number | string }>(metricsResult),
    reviewPage,
    reviewSummary,
  };
}

/** The vendor page's public rows, or null for an unknown or unapproved vendor. */
export const getCachedPublicVendorPage = cachedPublicEntity('public-vendor-page', readPublicVendorPage, ['activities', 'outlets']);

/**
 * A product page's public data for one of the product's own outlets (undefined = the default outlet), or null when
 * the product is not publicly listed. Callers pass only an outlet id taken from the product's offers, so the number
 * of entries stays bounded by real offers. Booking slots are live and read by the page itself.
 */
export const getCachedPublicProductPage = cachedPublicEntity(
  'public-product-page',
  async (db, id: string, outletId: string | undefined) => {
    const activity = await getComputedActivity(id, undefined, db, outletId);
    if (!activity) return null;
    const [outletChoices, reviews] = await Promise.all([
      getOutletChoices(activity, db),
      // Scoped to the outlet the page pre-selects, as before.
      getProductReviews(activity.id, db, { outletId: activity.outletId }),
    ]);
    return { activity, outletChoices, reviews };
  },
  ['activities', 'outlets'],
);

/**
 * Share-preview rows for a product page: name, description, cover and visible review ratings. Deliberately not
 * filtered by review status, matching buildActivityMetadata: a circulating link to a product back in review still
 * unfurls, while the page body itself 404s.
 */
export const getCachedProductMetadataRows = cachedPublicEntity(
  'public-product-metadata',
  async (db, id: string) => {
    const [{ data: product, error }, { data: reviewRows, error: reviewError }] = await Promise.all([
      db.from('products').select('name,description,cover_url').eq('id', id).maybeSingle(),
      db.from('reviews').select('rating').eq('product_id', id).eq('is_visible', true),
    ]);
    if (error) throw error;
    if (reviewError) throw reviewError;
    if (!product) return null;
    return { product: product as { name: string; description: string | null; cover_url: string | null }, reviewRows: (reviewRows ?? []) as { rating: number }[] };
  },
  ['activities'],
);
