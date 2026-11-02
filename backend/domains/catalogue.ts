import { getOutletStock } from '@/lib/vendor/product-scope';
// Owner: Member 2 / catalogue side (Vendor/Outlet/Product)
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/backend/supabase";
import { haversineKm } from "@/backend/core/helpers";
import type { Activity, BookingSlot, ComputedActivity, OperatingHourWeekday, OperatingHours, Outlet, PlaceLocation, PriceRule, ProductReview, VendorSummary, Voucher } from "@/backend/core/types";
import type { ReviewMetric } from "@/backend/domains/review-metrics";
import { toProductReview } from "@/backend/domains/review-presenter";
import { filterActivitiesByVendor } from "@/backend/domains/catalogue-filters";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import {
  canonicalCategorySlug,
  DISCOVERY_CATEGORIES,
  getDiscoveryCategoryLabel,
  type RealCategorySlug,
} from "@/lib/customer/discovery-categories";
import { productImageUrl } from "@/lib/storage/product-image";
import { vendorImageUrl } from "@/lib/storage/vendor-image";
import { getMalaysiaTodayKey, getOperatingHoursPeriods, isOperatingHoursAtAvailable, isOperatingHoursOpenNow, isOperatingHoursWindowAvailable } from "@/lib/customer/operating-hours";

export { STATES_MY } from "@/lib/customer/malaysia-states";

export { aggregateReviewMetrics } from "@/backend/domains/review-metrics";

const REVIEW_METRICS_BATCH_SIZE = 100;

// ─── Vendors (approval lives here, not per-outlet — see VendorSummary) ─────
type VendorWithOutletsRow = {
  id: string;
  name: string;
  status: string;
  kind: string | null;
  logo_url: string | null;
  cover_url: string | null;
  outlets: {
    id: string;
    name: string;
    city: string;
    state: string;
    status: string | null;
    review_status: string | null;
    operating_hours: OperatingHours | null;
    badge_slugs?: string[] | null;
  }[] | null;
};

export async function getVendors(db: SupabaseClient = supabase): Promise<VendorSummary[]> {
  const selectVendors = async (includeOutletBadges: boolean) => {
    const { data, error } = await db.from("vendors").select(includeOutletBadges
      ? "id,name,status,kind,logo_url,cover_url,outlets(id,name,city,state,status,review_status,operating_hours,badge_slugs)"
      : "id,name,status,kind,logo_url,cover_url,outlets(id,name,city,state,status,review_status,operating_hours)");
    return { data: data as unknown as VendorWithOutletsRow[] | null, error };
  };
  let { data, error } = await selectVendors(true);
  if (isMissingOutletColumn(error, "badge_slugs")) ({ data, error } = await selectVendors(false));
  if (error) throw error;
  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status,
    kind: v.kind === "event" ? "event" : "shop",
    logoUrl: v.logo_url,
    coverUrl: v.cover_url,
    outlets: (v.outlets ?? []).filter((outlet) =>
      (!outlet.status || outlet.status === "active") &&
      (!outlet.review_status || outlet.review_status === "approved"),
    ).map((outlet) => ({
      id: outlet.id,
      name: outlet.name,
      city: outlet.city,
      state: outlet.state,
      operatingHours: outlet.operating_hours,
      currentlyOpen: outlet.status === "active" && outlet.operating_hours
        ? isOperatingHoursOpenNow(outlet.operating_hours)
        : false,
      badgeSlugs: outlet.badge_slugs ?? [],
    })),
  }));
}

export async function setVendorApproved(vendorId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.from("vendors").update({ status: approved ? "approved" : "rejected" }).eq("id", vendorId);
  if (error) throw error;
}

// ─── Outlets ────────────────────────────────────────────────────────────────
function formatTodayHours(hours: OperatingHours | null): string {
  if (!hours) return "";
  const today = hours[getMalaysiaTodayKey()] ?? Object.values(hours)[0];
  const periods = getOperatingHoursPeriods(today);
  return periods.map((period) => `${period.open} – ${period.close}`).join(", ");
}

type OutletRow = {
  id: string;
  vendor_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  operating_hours: OperatingHours | null;
  phone: string | null;
  status: string;
  wheelchair_accessible: boolean | null;
  pet_friendly: boolean | null;
  food_service_modes?: ("dine_in" | "takeaway")[] | null;
  badge_slugs?: string[] | null;
  accommodation_type_slugs?: string[] | null;
  outlet_pages: { hero_url: string | null } | { hero_url: string | null }[] | null;
  vendors: {
    name: string | null;
    slug: string | null;
    status: string;
    products: { categories: { name: string; slug: string | null } | null }[] | null;
  } | null;
};

const VENDOR_LOGO_PATH_OVERRIDES: Record<string, string> = {
  "ghee-hiang": "curated-v3/vendor/ghee-hiang/logo.png",
};

function getVendorLogoUrl(slug: string | null | undefined): string | null {
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const path = VENDOR_LOGO_PATH_OVERRIDES[slug] ?? `entities/vendor/${slug}/logo.png`;
  return vendorImageUrl(path);
}

const OUTLET_SELECT = "id,vendor_id,name,address,city,state,lat,lng,operating_hours,phone,status,wheelchair_accessible,pet_friendly,food_service_modes,badge_slugs,accommodation_type_slugs,outlet_pages(hero_url),vendors(name,slug,status,products(categories(name,slug)))";
const OUTLET_SELECT_WITHOUT_TAXONOMY = OUTLET_SELECT.replace(",badge_slugs,accommodation_type_slugs", "");
const LEGACY_OUTLET_SELECT = OUTLET_SELECT_WITHOUT_TAXONOMY.replace(",food_service_modes", "");
const DISCOVERY_OUTLET_SELECT = "id,vendor_id,name,city,state,lat,lng,operating_hours,status,wheelchair_accessible,pet_friendly,food_service_modes,badge_slugs,accommodation_type_slugs,vendors(name,slug,status)";
const DISCOVERY_OUTLET_SELECT_WITHOUT_TAXONOMY = DISCOVERY_OUTLET_SELECT.replace(",badge_slugs,accommodation_type_slugs", "");
const LEGACY_DISCOVERY_OUTLET_SELECT = DISCOVERY_OUTLET_SELECT_WITHOUT_TAXONOMY.replace(",food_service_modes", "");

function isMissingOutletColumn(error: { code?: string; message?: string } | null | undefined, column: "food_service_modes" | "badge_slugs" | "accommodation_type_slugs"): boolean {
  return (error?.code === "42703" || error?.code === "PGRST204")
    && Boolean(error.message?.includes(`outlets.${column}`) || error.message?.includes(`'${column}'`));
}

// An outlet's category belongs to its vendor, not to whichever product happens
// to be pinned to that one outlet. Vendor-wide products carry outlet_id NULL, so
// the old outlet-level embed left every branch without an exclusive item
// uncategorised. Most-common wins; ties break by DISCOVERY_CATEGORIES order so
// the result never changes between requests (PostgREST embeds are unordered).
export function resolveVendorCategory(
  products: { categories: { name: string; slug: string | null } | null }[] | null | undefined,
): string {
  const counts = new Map<string, number>();
  for (const product of products ?? []) {
    const slug = product.categories?.slug;
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  if (counts.size === 0) return "";

  // Annotated string[] deliberately: DISCOVERY_CATEGORIES is `as const`, so an
  // inferred literal-union array rejects indexOf(someString).
  const order: string[] = DISCOVERY_CATEGORIES.map((c) => c.slug);
  const rank = (slug: string) => {
    const index = order.indexOf(canonicalCategorySlug(slug) ?? slug);
    return index === -1 ? order.length : index;
  };
  const winner = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]),
  )[0][0];

  return canonicalCategorySlug(winner) ? getDiscoveryCategoryLabel(winner) : winner;
}

function mapOutlet(row: OutletRow): Outlet {
  const outletPage = Array.isArray(row.outlet_pages) ? row.outlet_pages[0] : row.outlet_pages;
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: row.vendors?.name ?? undefined,
    vendorLogoUrl: getVendorLogoUrl(row.vendors?.slug),
    name: row.name,
    coverUrl: outletPage?.hero_url?.trim() || null,
    category: resolveVendorCategory(row.vendors?.products),
    state: row.state ?? "",
    city: row.city ?? "",
    address: row.address ?? "",
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    hours: formatTodayHours(row.operating_hours),
    operatingHours: row.operating_hours,
    phone: row.phone ?? undefined,
    verified: row.vendors?.status === "approved",
    open: row.status === "active",
    currentlyOpen: row.status === "active" && row.operating_hours ? isOperatingHoursOpenNow(row.operating_hours) : false,
    rating: 0,
    reviews: 0,
    wheelchairAccessible: row.wheelchair_accessible,
    petFriendly: row.pet_friendly,
    foodServiceModes: row.food_service_modes ?? ["dine_in", "takeaway"],
    badgeSlugs: row.badge_slugs ?? [],
    accommodationTypeSlugs: row.accommodation_type_slugs ?? [],
  };
}

export async function getOutlets(db: SupabaseClient = supabase): Promise<Outlet[]> {
  const queryOutlets = (select: string) => db
    .from("outlets")
    .select(select)
    .eq("status", "active")
    .eq("review_status", "approved");
  const result = await queryOutlets(OUTLET_SELECT);
  if (isMissingOutletColumn(result.error, "badge_slugs") || isMissingOutletColumn(result.error, "accommodation_type_slugs")) {
    // Keep existing outlet fields available while the additive taxonomy migration is pending.
    const withoutTaxonomy = await queryOutlets(OUTLET_SELECT_WITHOUT_TAXONOMY);
    if (!withoutTaxonomy.error) return (withoutTaxonomy.data as unknown as OutletRow[]).map(mapOutlet);
    if (!isMissingOutletColumn(withoutTaxonomy.error, "food_service_modes")) throw withoutTaxonomy.error;
  }
  if (isMissingOutletColumn(result.error, "food_service_modes") || isMissingOutletColumn(result.error, "badge_slugs") || isMissingOutletColumn(result.error, "accommodation_type_slugs")) {
    // The food-service field predates this taxonomy. Retain the pre-existing legacy projection as the final compatibility fallback.
    const legacy = await queryOutlets(LEGACY_OUTLET_SELECT);
    if (legacy.error) throw legacy.error;
    return (legacy.data as unknown as OutletRow[]).map(mapOutlet);
  }
  if (result.error) throw result.error;
  return (result.data as unknown as OutletRow[]).map(mapOutlet);
}

type DiscoveryOutletRow = Pick<OutletRow,
  "id" | "vendor_id" | "name" | "city" | "state" | "lat" | "lng" | "operating_hours" | "status" | "wheelchair_accessible" | "pet_friendly" | "food_service_modes" | "badge_slugs" | "accommodation_type_slugs"
> & {
  vendors: { name: string | null; slug: string | null; status: string } | null;
};

async function getDiscoveryOutlets(ids: string[], db: SupabaseClient, badgeSlugs: string[] = []): Promise<Outlet[]> {
  const outletIds = [...new Set(ids.filter(Boolean))];
  if (outletIds.length === 0) return [];

  // Keep each `in` filter bounded; products may be sold at many outlets.
  const batches = Array.from({ length: Math.ceil(outletIds.length / 200) }, (_, index) =>
    outletIds.slice(index * 200, (index + 1) * 200),
  );
  const batchRows = await mapWithConcurrencyTwo(batches, async (batch) => {
    const query = (select: string, includeBadgeFilter: boolean) => {
      let builder = db
        .from("outlets")
        .select(select)
        .in("id", batch)
        .eq("status", "active")
        .eq("review_status", "approved");
      if (badgeSlugs.length > 0 && includeBadgeFilter) builder = builder.overlaps("badge_slugs", badgeSlugs);
      return builder;
    };
    const result = await query(DISCOVERY_OUTLET_SELECT, true);
    if (isMissingOutletColumn(result.error, "badge_slugs") || isMissingOutletColumn(result.error, "accommodation_type_slugs")) {
      const withoutTaxonomy = await query(DISCOVERY_OUTLET_SELECT_WITHOUT_TAXONOMY, false);
      if (!withoutTaxonomy.error) return (withoutTaxonomy.data ?? []) as unknown as DiscoveryOutletRow[];
      if (!isMissingOutletColumn(withoutTaxonomy.error, "food_service_modes")) throw withoutTaxonomy.error;
    }
    if (isMissingOutletColumn(result.error, "food_service_modes") || isMissingOutletColumn(result.error, "badge_slugs") || isMissingOutletColumn(result.error, "accommodation_type_slugs")) {
      const legacy = await query(LEGACY_DISCOVERY_OUTLET_SELECT, false);
      if (legacy.error) throw legacy.error;
      return (legacy.data ?? []) as unknown as DiscoveryOutletRow[];
    }
    if (result.error) throw result.error;
    return (result.data ?? []) as unknown as DiscoveryOutletRow[];
  });

  return batchRows.flat().map((row) => mapOutlet({
    ...row,
    address: null,
    phone: null,
    outlet_pages: null,
    vendors: row.vendors ? { ...row.vendors, products: [] } : null,
  } as OutletRow));
}

export async function getDiscoveryOutletsByIds(
  ids: string[],
  db: SupabaseClient = supabase,
  badgeSlugs: string[] = [],
): Promise<Outlet[]> {
  return getDiscoveryOutlets(ids, db, badgeSlugs);
}

export async function mapWithConcurrencyTwo<T, R>(items: T[], mapper: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      signal?.throwIfAborted();
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, () => worker()));
  return results;
}

/** One buyable choice on the product page: which outlet, at what price. */
export interface OutletChoice {
  outletId: string;
  outletName: string;
  city: string;
  price: number;
  open: boolean;
  currentlyOpen?: boolean;
  hours: string;
  operatingHours?: OperatingHours | null;
  state: string;
  verified: boolean;
  vendorId: string;
  vendorName?: string;
  /** This product's rating/review count at this outlet specifically. */
  rating: number;
  reviews: number;
  badgeSlugs: string[];
  accommodationTypeSlugs: string[];
}

/**
 * The outlets a product can actually be bought from, with each outlet's own
 * price. Returns a single entry for a normal single-outlet product, so the
 * product page can treat both shapes identically.
 */
export async function getOutletChoices(activity: Activity, db: SupabaseClient = supabase): Promise<OutletChoice[]> {
  if (!activity.offers?.length) return [];
  const [outlets, reviewMetrics] = await Promise.all([
    getDiscoveryOutlets(activity.offers.map((offer) => offer.outletId), db),
    getOutletReviewMetrics(activity.id, db),
  ]);
  const byId = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  return activity.offers
    .map((offer): OutletChoice | null => {
      const outlet = byId.get(offer.outletId);
      if (!outlet) return null;
      const metric = reviewMetrics.get(outlet.id) ?? { rating: 0, reviews: 0 };
      return {
        outletId: outlet.id,
        outletName: outlet.name,
        city: outlet.city,
        price: offer.price,
        open: outlet.open,
        currentlyOpen: outlet.currentlyOpen,
        hours: outlet.hours,
        operatingHours: outlet.operatingHours,
        state: outlet.state,
        verified: outlet.verified,
        vendorId: outlet.vendorId,
        vendorName: outlet.vendorName,
        rating: metric.rating,
        reviews: metric.reviews,
        badgeSlugs: outlet.badgeSlugs ?? [],
        accommodationTypeSlugs: outlet.accommodationTypeSlugs ?? [],
      };
    })
    .filter((choice): choice is OutletChoice => choice !== null)
    .sort((a, b) => a.price - b.price);
}

/**
 * A single product's rating/review count broken down by outlet — for the
 * product page's per-outlet display, not the catalogue-wide aggregate. Only
 * ever queries one product's reviews, so it never hits PostgREST's row cap.
 */
export async function getOutletReviewMetrics(productId: string, db: SupabaseClient = supabase): Promise<Map<string, ReviewMetric>> {
  const { data, error } = await db
    .from("reviews")
    .select("outlet_id,rating")
    .eq("product_id", productId)
    .eq("is_visible", true);
  if (error) throw error;

  const totals = new Map<string, { total: number; reviews: number }>();
  for (const row of (data ?? []) as { outlet_id: string | null; rating: number }[]) {
    if (!row.outlet_id) continue;
    const current = totals.get(row.outlet_id) ?? { total: 0, reviews: 0 };
    current.total += Number(row.rating);
    current.reviews += 1;
    totals.set(row.outlet_id, current);
  }
  return new Map([...totals.entries()].map(([outletId, value]) => [
    outletId,
    { rating: Math.round((value.total / value.reviews) * 10) / 10, reviews: value.reviews },
  ]));
}

/**
 * Product ids the outlet(s) sell: directly owned products plus shared vendor
 * products with an active offer. Multiple outlets are resolved in two batched
 * relation queries instead of one pair of queries per outlet.
 */
export async function getOutletProductIds(db: SupabaseClient, outletId: string | string[], candidateIds?: string[]): Promise<Set<string>> {
  const outletIds = typeof outletId === "string" ? [outletId] : [...new Set(outletId.filter(Boolean))];
  if (!outletIds.length) return new Set();

  let ownQuery = db.from("products").select("id");
  let offerQuery = db.from("outlet_offers").select("product_id").eq("status", "active");
  if (outletIds.length === 1) {
    ownQuery = ownQuery.eq("outlet_id", outletIds[0]);
    offerQuery = offerQuery.eq("outlet_id", outletIds[0]);
  } else {
    ownQuery = ownQuery.in("outlet_id", outletIds);
    offerQuery = offerQuery.in("outlet_id", outletIds);
  }
  if (candidateIds?.length) {
    ownQuery = ownQuery.in("id", candidateIds);
    offerQuery = offerQuery.in("product_id", candidateIds);
  }
  const [own, offered] = await Promise.all([ownQuery, offerQuery]);
  if (own.error) throw own.error;
  if (offered.error) throw offered.error;
  return new Set([
    ...(own.data ?? []).map((row: { id: string }) => row.id),
    ...(offered.data ?? []).map((row: { product_id: string }) => row.product_id),
  ]);
}

export async function getOutlet(id: string): Promise<Outlet | undefined> {
  const { data, error } = await supabase
    .from("outlets")
    .select(OUTLET_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .eq("review_status", "approved")
    .maybeSingle();
  if (error) throw error;
  return data ? mapOutlet(data as unknown as OutletRow) : undefined;
}

// ─── Products (activities) ─────────────────────────────────────────────────
type ProductRow = {
  id: string;
  vendor_id: string;
  outlet_id: string | null;
  outlet_offers?: { outlet_id: string; price: number; status: string }[] | null;
  name: string;
  description?: string | null;
  cover_url: string | null;
  base_price: number;
  requires_booking: boolean;
  status: string;
  review_status: string;
  tags: string[] | null;
  created_at: string;
  attributes: Record<string, unknown> | null;
  is_hidden_gem: boolean;
  type_slugs: string[] | null;
  is_family_friendly: boolean;
  is_couple_friendly: boolean;
  place_state: string | null;
  place_district: string | null;
  place_lat: number | string | null;
  place_lng: number | string | null;
  categories: { name: string; slug: string } | null;
  product_variants?: { id: string; name: string; price_offset: number; is_default?: boolean; is_active?: boolean; inventory?: { outlet_id: string; quantity: number; reserved: number; low_stock_threshold: number }[] }[];
  price_rules?: { id: string; rule_type: PriceRule["ruleType"]; label: string | null; multiplier: number | null; fixed_amount: number | null; valid_from: string | null; valid_until: string | null; min_quantity: number | null; bundle_product_ids: string[] | null; priority: number; is_active: boolean }[];
};

const ACTIVITY_SELECT = "id,vendor_id,outlet_id,name,description,cover_url,base_price,requires_booking,status,review_status,tags,created_at,attributes,is_hidden_gem,type_slugs,is_family_friendly,is_couple_friendly,place_state,place_district,place_lat,place_lng,categories(name,slug),outlet_offers(outlet_id,price,status),product_variants(id,name,price_offset,is_default,is_active,inventory(outlet_id,quantity,reserved,low_stock_threshold)),price_rules(id,rule_type,label,multiplier,fixed_amount,valid_from,valid_until,min_quantity,bundle_product_ids,priority,is_active)";
const DISCOVERY_ACTIVITY_SELECT = "id,vendor_id,outlet_id,name,description,cover_url,base_price,requires_booking,status,review_status,tags,created_at,attributes,is_hidden_gem,type_slugs,is_family_friendly,is_couple_friendly,place_state,place_district,place_lat,place_lng,categories(name,slug),outlet_offers(outlet_id,price,status)";

export interface DiscoveryReviewMetricEntry extends ReviewMetric {
  productId: string;
}

async function getReviewMetricsForProducts(productIds: string[], db: SupabaseClient): Promise<Map<string, ReviewMetric>> {
  const metricBatches: Array<() => PromiseLike<{ product_id: string; rating: number | string; reviews: number | string }[]>> = Array.from({ length: Math.ceil(productIds.length / REVIEW_METRICS_BATCH_SIZE) }, (_, index) => {
      const batch = productIds.slice(index * REVIEW_METRICS_BATCH_SIZE, (index + 1) * REVIEW_METRICS_BATCH_SIZE);
      return () => db
        .from("product_review_metrics")
        .select("product_id,rating,reviews")
        .in("product_id", batch)
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as { product_id: string; rating: number | string; reviews: number | string }[];
        });
    });
  const metricRows = (await mapWithConcurrencyTwo<typeof metricBatches[number], { product_id: string; rating: number | string; reviews: number | string }[]>(metricBatches, (load) => Promise.resolve(load()))).flat();

  return new Map(metricRows.map((row) => [
    row.product_id,
    { rating: Number(row.rating), reviews: Number(row.reviews) },
  ]));
}

export async function getDiscoveryReviewMetricEntries(
  productIds: string[],
  db: SupabaseClient = supabase,
): Promise<DiscoveryReviewMetricEntry[]> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  const metrics = await getReviewMetricsForProducts(uniqueIds, db);
  return [...metrics.entries()].map(([productId, metric]) => ({ productId, ...metric }));
}

function mapActivity(row: ProductRow, reviewMetrics: ReviewMetric = { rating: 0, reviews: 0 }): Activity {
  // A shared product carries outlet_id = NULL and lists its outlets in
  // outlet_offers. Single-outlet products keep using outlet_id/base_price, so
  // both shapes flow through the same mapper.
  const offers = (row.outlet_offers ?? [])
    .filter((offer) => offer.status === "active")
    .map((offer) => ({ outletId: offer.outlet_id, price: Number(offer.price), status: offer.status }));
  const cheapest = offers.length
    ? offers.reduce((min, offer) => (offer.price < min.price ? offer : min))
    : undefined;
  const activeVariants = (row.product_variants ?? [])
    .filter((variant) => variant.is_active !== false)
    .sort((left, right) => Number(Boolean(right.is_default)) - Number(Boolean(left.is_default)));

  // Only ever set when all three of state/lat/lng are present — the same
  // all-or-nothing rule the DB CHECK constraint enforces, checked again here
  // because a partial row should never silently plot at (0, 0). NUMERIC
  // columns arrive as strings over PostgREST, hence the Number() calls.
  const place: PlaceLocation | undefined =
    row.place_state != null && row.place_lat != null && row.place_lng != null
      ? {
          state: row.place_state,
          district: row.place_district ?? undefined,
          lat: Number(row.place_lat),
          lng: Number(row.place_lng),
        }
      : undefined;

  return {
    id: row.id,
    vendorId: row.vendor_id,
    outletId: row.outlet_id ?? cheapest?.outletId ?? "",
    offers: offers.length ? offers : undefined,
    name: row.name,
    category: canonicalCategorySlug(row.categories?.slug) ? getDiscoveryCategoryLabel(row.categories?.slug) : row.categories?.name ?? "",
    description: row.description ?? "",
    image: productImageUrl(row.cover_url) ?? null,
    // Card shows "from" pricing when the product is sold at several outlets.
    price: cheapest ? cheapest.price : Number(row.base_price),
    rating: reviewMetrics.rating,
    reviews: reviewMetrics.reviews,
    duration: "",
    requiresBooking: row.requires_booking,
    tags: row.tags ?? undefined,
    categorySlug: canonicalCategorySlug(row.categories?.slug) ?? undefined,
    createdAt: row.created_at,
    attributes: row.attributes ?? undefined,
    isHiddenGem: row.is_hidden_gem,
    typeSlugs: row.type_slugs ?? undefined,
    isFamilyFriendly: row.is_family_friendly,
    isCoupleFriendly: row.is_couple_friendly,
    place,
    variants: activeVariants.map((v) => ({ id: v.id, label: v.name, priceDelta: Number(v.price_offset) })),
    priceRules: (row.price_rules ?? []).filter((rule) => rule.is_active).map((rule) => ({ id: rule.id, productId: row.id, ruleType: rule.rule_type, label: rule.label ?? undefined, multiplier: rule.multiplier === null ? undefined : Number(rule.multiplier), fixedAmount: rule.fixed_amount === null ? undefined : Number(rule.fixed_amount), validFrom: rule.valid_from ?? undefined, validUntil: rule.valid_until ?? undefined, minQuantity: rule.min_quantity ?? undefined, bundleProductIds: rule.bundle_product_ids ?? undefined, priority: Number(rule.priority ?? 0), isActive: rule.is_active })),
    ...(row.requires_booking ? {} : getOutletStock(row.product_variants ?? [], [row.outlet_id ?? cheapest?.outletId ?? ''])),
    stockByOutlet: row.requires_booking ? undefined : Object.fromEntries(
      [...new Set([row.outlet_id, ...offers.map((offer) => offer.outletId)].filter((id): id is string => Boolean(id)))].map((id) => [id, getOutletStock(row.product_variants ?? [], [id]).availableStock]),
    ),
  };
}

export async function getActivities(db: SupabaseClient = supabase): Promise<Activity[]> {
  const { data, error } = await db.from("products").select(ACTIVITY_SELECT).eq("status", "active").eq("review_status", "approved");
  if (error) throw error;
  const rows = data as unknown as ProductRow[];
  if (rows.length === 0) return [];

  // Read the database-side aggregate view instead of pulling raw review rows and
  // averaging in memory — that hit PostgREST's silent 1000-row cap and produced
  // wrong ratings site-wide (M8). Number() is required: PostgREST serialises
  // NUMERIC and BIGINT as strings.
  const productIds = rows.map((row) => row.id);
  const reviewMetrics = await getReviewMetricsForProducts(productIds, db);
  return rows.map((row) => mapActivity(row, reviewMetrics.get(row.id)));
}

export type DiscoveryActivityData = {
  activities: Activity[];
  outlets: Outlet[];
};

async function loadDiscoveryActivityData(
  db: SupabaseClient,
  outletBadgeSlugs: string[] = [],
): Promise<DiscoveryActivityData & { outletMap: Map<string, Outlet> }> {
  const activities = await getDiscoveryProductActivities(db);
  if (activities.length === 0) return { activities: [], outlets: [], outletMap: new Map() };

  const productIds = activities.map((activity) => activity.id);
  const outletIds = getDiscoveryOutletIds(activities);
  // Keep the refresh-wide query ceiling at two: the metric and outlet query
  // families each batch internally and run in turn rather than concurrently.
  const reviewMetrics = await getDiscoveryReviewMetricEntries(productIds, db);
  const outlets = await getDiscoveryOutletsByIds(outletIds, db, outletBadgeSlugs);

  return {
    activities: applyDiscoveryReviewMetrics(activities, reviewMetrics),
    outlets,
    outletMap: new Map(outlets.map((outlet) => [outlet.id, outlet])),
  };
}

export async function getDiscoveryProductActivities(db: SupabaseClient = supabase): Promise<Activity[]> {
  const rows: ProductRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from("products")
      .select(DISCOVERY_ACTIVITY_SELECT)
      .eq("status", "active")
      .eq("review_status", "approved")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as ProductRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map((row) => mapActivity(row));
}

export function getDiscoveryOutletIds(activities: Activity[]): string[] {
  return [...new Set(activities.flatMap((activity) => [
    activity.outletId,
    ...(activity.offers ?? []).map((offer) => offer.outletId),
  ]).filter(Boolean))].sort();
}

export function applyDiscoveryReviewMetrics(
  activities: Activity[],
  metricEntries: DiscoveryReviewMetricEntry[],
): Activity[] {
  const metricsByProductId = new Map(metricEntries.map(({ productId, rating, reviews }) => [
    productId,
    { rating, reviews },
  ]));

  return activities.map((activity) => ({
    ...activity,
    ...(metricsByProductId.get(activity.id) ?? { rating: 0, reviews: 0 }),
  }));
}

export async function getDiscoveryActivityData(db: SupabaseClient = supabase): Promise<DiscoveryActivityData> {
  const { activities, outlets } = await loadDiscoveryActivityData(db);
  return { activities, outlets };
}

export function computeDiscoveryActivities(
  data: DiscoveryActivityData,
  from?: { lat: number; lng: number },
): ComputedActivity[] {
  const outletMap = new Map(data.outlets.map((outlet) => [outlet.id, outlet]));
  return data.activities
    .map((activity) => toComputed(activity, outletMap, from))
    .filter((activity): activity is ComputedActivity => activity !== null)
    .sort((a, b) => b.rating * b.reviews - a.rating * a.reviews);
}

/**
 * Public discovery searches need card, map, and ranking fields, not checkout
 * inventory or product-page pricing rules. Keep those full relations in
 * getActivities() and share this smaller selector with cached Home/Explore and
 * related-product card data.
 */
export async function getDiscoveryActivities(
  db: SupabaseClient = supabase,
  from?: { lat: number; lng: number },
): Promise<ComputedActivity[]> {
  return computeDiscoveryActivities(await loadDiscoveryActivityData(db), from);
}

/**
 * Load only the products needed to calculate cart line prices. Ratings are
 * intentionally omitted because cart totals use price rules and variants,
 * never review metrics.
 */
export async function getActivitiesByIds(ids: string[], db: SupabaseClient = supabase): Promise<Activity[]> {
  const productIds = [...new Set(ids.filter(Boolean))];
  if (productIds.length === 0) return [];

  const { data, error } = await db
    .from("products")
    .select(ACTIVITY_SELECT)
    .in("id", productIds)
    .eq("status", "active")
    .eq("review_status", "approved");
  if (error) throw error;

  return ((data ?? []) as unknown as ProductRow[]).map((row) => mapActivity(row));
}

export async function getBookingSlots(activityId: string, db: SupabaseClient = supabase): Promise<BookingSlot[]> {
  const { data, error } = await db.from("booking_slots").select("id,product_id,outlet_id,starts_at,ends_at,capacity,booked,status,price_override").eq("product_id", activityId).order("starts_at");
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, activityId: s.product_id, outletId: s.outlet_id, startsAt: s.starts_at, endsAt: s.ends_at, capacity: s.capacity, booked: s.booked, status: s.status, priceOverride: s.price_override === null ? undefined : Number(s.price_override) }));
}

export async function getProductReviews(productId: string, db: SupabaseClient = supabase, options: { outletId?: string } = {}): Promise<ProductReview[]> {
  return (await getProductReviewsPage(productId, { page: 1, pageSize: 3, outletId: options.outletId }, db)).items;
}

export interface ProductReviewPage {
  items: ProductReview[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ProductReviewViewerState = "signed_out" | "eligible" | "not_purchased" | "already_reviewed";

export interface ProductReviewEligibility {
  state: ProductReviewViewerState;
  canReview: boolean;
  orderItemId: string | null;
}

type ReviewEligibilityRow = {
  id: string;
  outlet_id: string;
  reviews: { id: string } | { id: string }[] | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getProductReviewEligibility(
  productId: string,
  viewerId: string,
  options: { outletId?: string } = {},
  db: SupabaseClient = supabase,
): Promise<ProductReviewEligibility> {
  let query = db
    .from("order_items")
    .select("id,outlet_id,reviews(id),orders!inner(user_id,status)")
    .eq("product_id", productId)
    .eq("orders.user_id", viewerId)
    .in("orders.status", ["paid", "completed"])
    .limit(20);
  if (options.outletId) query = query.eq("outlet_id", options.outletId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as ReviewEligibilityRow[];
  const eligible = rows.find((row) => !firstRelation(row.reviews));
  if (eligible) {
    return { state: "eligible", canReview: true, orderItemId: eligible.id };
  }
  if (rows.length > 0) {
    return { state: "already_reviewed", canReview: false, orderItemId: null };
  }
  return { state: "not_purchased", canReview: false, orderItemId: null };
}

export async function getPublicReviewAuthorNames(
  db: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await db
    .from("public_users")
    .select("id,full_name")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as { id: string; full_name: string | null }[])
    .map((user) => [user.id, user.full_name]));
}

export async function getProductReviewsPage(
  productId: string,
  options: { page?: number; pageSize?: number; outletId?: string; rating?: number } = {},
  db: SupabaseClient = supabase,
): Promise<ProductReviewPage> {
  const requestedPageSize = Math.floor(Number(options.pageSize ?? 5));
  const pageSize = Math.min(10, Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 5));

  let countQuery = db
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("is_visible", true);
  if (options.outletId) countQuery = countQuery.eq("outlet_id", options.outletId);
  if (options.rating !== undefined) countQuery = countQuery.eq("rating", options.rating);
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.floor(Number(options.page ?? 1));
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1));
  const offset = (page - 1) * pageSize;

  let dataQuery = db
    .from("reviews")
    .select("id,rating,title,body,created_at,user_id")
    .eq("product_id", productId)
    .eq("is_visible", true);
  if (options.outletId) dataQuery = dataQuery.eq("outlet_id", options.outletId);
  if (options.rating !== undefined) dataQuery = dataQuery.eq("rating", options.rating);
  const { data, error } = await dataQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;

  const reviewRows = (data ?? []) as {
    id: string;
    rating: number;
    title: string | null;
    body: string | null;
    created_at: string;
    user_id: string | null;
  }[];
  const authorNames = await getPublicReviewAuthorNames(db, reviewRows.map((row) => row.user_id ?? ""));

  return {
    items: reviewRows.map((row) => toProductReview({
      ...row,
      users: { full_name: row.user_id ? authorNames.get(row.user_id) ?? null : null },
    })),
    page,
    pageSize,
    total,
    totalPages,
  };
}

/**
 * Collapses a product to the single outlet the card should represent. A product
 * sold at several outlets appears ONCE — as the nearest outlet when the user's
 * position is known, else the cheapest — instead of once per outlet.
 */
function toComputed(
  activity: Activity,
  outletMap: Map<string, Outlet>,
  from?: { lat: number; lng: number },
  preferredOutletId?: string,
): ComputedActivity | null {
  const candidates = (activity.offers ?? [])
    .map((offer) => ({ offer, outlet: outletMap.get(offer.outletId) }))
    .filter((candidate): candidate is { offer: NonNullable<Activity["offers"]>[number]; outlet: Outlet } => Boolean(candidate.outlet));

  if (candidates.length === 0) {
    const outlet = outletMap.get(activity.outletId);
    if (!outlet) return null;
    return { ...activity, outlet, distanceKm: from ? haversineKm(from, { lat: outlet.lat, lng: outlet.lng }) : undefined };
  }

  const scored = candidates.map((candidate) => ({
    ...candidate,
    distanceKm: from ? haversineKm(from, { lat: candidate.outlet.lat, lng: candidate.outlet.lng }) : undefined,
  }));
  const best = scored.find((candidate) => candidate.outlet.id === preferredOutletId) ?? (from
    ? scored.reduce((a, b) => ((b.distanceKm ?? Infinity) < (a.distanceKm ?? Infinity) ? b : a))
    : scored.reduce((a, b) => (b.offer.price < a.offer.price ? b : a)));

  return {
    ...activity,
    outletId: best.outlet.id,
    price: best.offer.price,
    outlet: best.outlet,
    distanceKm: best.distanceKm,
  };
}

export function composeDiscoveryActivities(
  activities: Activity[],
  outlets: Outlet[],
  from?: { lat: number; lng: number },
): ComputedActivity[] {
  const outletMap = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  return activities
    .map((activity) => toComputed(activity, outletMap, from))
    .filter((activity): activity is ComputedActivity => activity !== null)
    .sort((a, b) => b.rating * b.reviews - a.rating * a.reviews);
}

/**
 * One product plus only the outlets it actually sells at. Deliberately does not
 * use the discovery search: this query loads one product and its relevant
 * outlets, rather than scanning the full catalogue for a detail/wishlist row.
 */
export async function getComputedActivity(
  id: string,
  from?: { lat: number; lng: number },
  db: SupabaseClient = supabase,
  preferredOutletId?: string,
): Promise<ComputedActivity | null> {
  const { data: row, error } = await db
    .from("products")
    .select(ACTIVITY_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .eq("review_status", "approved")
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: metricRow, error: metricError } = await db
    .from("product_review_metrics")
    .select("product_id,rating,reviews")
    .eq("product_id", id)
    .maybeSingle();
  if (metricError) throw metricError;

  const metric = metricRow
    ? {
        rating: Number((metricRow as { rating: number | string }).rating),
        reviews: Number((metricRow as { reviews: number | string }).reviews),
      }
    : { rating: 0, reviews: 0 };

  const activity = mapActivity(row as unknown as ProductRow, metric);

  // A shared product lists several outlets in offers; a single-outlet product
  // only has outletId. Fetch whichever set applies, nothing more.
  const outletIds = [...new Set([
    ...(activity.offers ?? []).map((offer) => offer.outletId),
    activity.outletId,
  ].filter(Boolean))];
  if (outletIds.length === 0) return null;

  const { data: outletRows, error: outletError } = await db
    .from("outlets")
    .select(OUTLET_SELECT)
    .in("id", outletIds)
    .eq("status", "active")
    .eq("review_status", "approved");
  if (outletError) throw outletError;

  const outletMap = new Map(
    ((outletRows ?? []) as unknown as OutletRow[]).map((outletRow) => {
      const outlet = mapOutlet(outletRow);
      return [outlet.id, outlet] as const;
    }),
  );

  return toComputed(activity, outletMap, from, preferredOutletId);
}

/** Products sold by one outlet, with the outlet's own offer price applied. */
export async function getOutletActivities(outletId: string, excludeProductId?: string, db: SupabaseClient = supabase): Promise<ComputedActivity[]> {
  const { activities, outletMap } = await loadDiscoveryActivityData(db);
  const outlet = outletMap.get(outletId);
  if (!outlet) return [];

  return activities
    .filter((activity) => activity.id !== excludeProductId)
    .map((activity) => {
      const offer = activity.offers?.find((candidate) => candidate.outletId === outletId);
      if (!offer && activity.outletId !== outletId) return null;
      return {
        ...activity,
        outletId,
        price: offer?.price ?? activity.price,
        outlet,
      } satisfies ComputedActivity;
    })
    .filter((activity): activity is ComputedActivity => activity !== null);
}

/**
 * Products from the same vendor as the given outlet, excluding one product.
 * Used on the activity detail page when the visitor arrived from a vendor page
 * (source=vendor) so the "More from …" rail shows the vendor catalogue, not a
 * single branch.
 */
export async function getVendorActivities(vendorId: string, excludeProductId?: string, db: SupabaseClient = supabase): Promise<ComputedActivity[]> {
  const { activities, outletMap } = await loadDiscoveryActivityData(db);
  const vendorOutlets = [...outletMap.values()].filter((o) => o.vendorId === vendorId);
  if (vendorOutlets.length === 0) return [];
  const vendorOutletIds = new Set(vendorOutlets.map((o) => o.id));

  return activities
    .filter((activity) => activity.id !== excludeProductId)
    .map((activity): ComputedActivity | null => {
      // Include activities that belong to any outlet of this vendor (via offers
      // or via the direct outlet_id field).
      const vendorOffer = (activity.offers ?? []).find((offer) => vendorOutletIds.has(offer.outletId));
      const fallbackOutlet = vendorOutletIds.has(activity.outletId) ? outletMap.get(activity.outletId) : undefined;
      const outlet = (vendorOffer ? outletMap.get(vendorOffer.outletId) : undefined) ?? fallbackOutlet;
      if (!outlet) return null;
      return {
        ...activity,
        outletId: outlet.id,
        price: vendorOffer?.price ?? activity.price,
        outlet,
      } satisfies ComputedActivity;
    })
    .filter((activity): activity is ComputedActivity => activity !== null)
    .slice(0, 3);
}

export interface SearchFilters {
  q?: string;
  /** Canonical real category slug; legacy display-name callers may use category. */
  categorySlug?: RealCategorySlug | null;
  category?: string | null;
  categories?: string[];
  /** `${categorySlug}:${typeSlug}` tokens. */
  types?: string[];
  hiddenGemOnly?: boolean;
  familyFriendlyOnly?: boolean;
  coupleFriendlyOnly?: boolean;
  state?: string | null;
  vendorId?: string | null;
  priceMax?: number | null;
  freeOnly?: boolean;
  bookableOnly?: boolean;
  openOnly?: boolean;
  openNow?: boolean;
  operatingDays?: OperatingHourWeekday[];
  hoursMode?: "any" | "at" | "during";
  timeAt?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  overnight?: boolean;
  near?: { lat: number; lng: number };
  sort?: "recommended" | "price_asc" | "rating_desc" | "distance_asc";
}

export function filterComputedActivities(filters: SearchFilters, activities: ComputedActivity[]): ComputedActivity[] {
  let results = [...activities];

  if (filters.q) {
    const q = filters.q.toLowerCase();
    results = results.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.outlet.city.toLowerCase().includes(q) ||
        a.outlet.state.toLowerCase().includes(q),
    );
  }
  const selectedCategories = [
    ...(filters.categories ?? []),
    ...(filters.categorySlug ? [filters.categorySlug] : []),
    ...(filters.category ? [filters.category] : []),
  ];
  const typesByCategory = new Map<string, Set<string>>();
  for (const token of filters.types ?? []) {
    const [rawCategory, type] = token.split(":", 2);
    const category = canonicalCategorySlug(rawCategory);
    if (!category || !type) continue;
    const types = typesByCategory.get(category) ?? new Set<string>();
    types.add(type);
    typesByCategory.set(category, types);
  }
  const categoryBranches = new Set(
    [...selectedCategories, ...typesByCategory.keys()]
      .map(canonicalCategorySlug)
      .filter((category): category is RealCategorySlug => category !== null),
  );
  if (categoryBranches.size > 0) {
    results = results.filter((activity) => {
      const category = canonicalCategorySlug(activity.categorySlug);
      if (!category || !categoryBranches.has(category)) return false;
      const selectedTypes = typesByCategory.get(category);
      return !selectedTypes || (activity.typeSlugs ?? []).some((type) => selectedTypes.has(type));
    });
  }
  if (filters.hiddenGemOnly || filters.familyFriendlyOnly || filters.coupleFriendlyOnly) {
    results = results.filter((activity) =>
      (filters.hiddenGemOnly && activity.outlet.badgeSlugs?.includes("hidden_gem")) ||
      (filters.familyFriendlyOnly && activity.outlet.badgeSlugs?.includes("family_friendly")) ||
      (filters.coupleFriendlyOnly && activity.outlet.badgeSlugs?.includes("couple_friendly")),
    );
  }
  if (filters.state && filters.state !== "All Malaysia") {
    results = results.filter((a) => (a.place?.state ?? a.outlet.state) === filters.state);
  }
  results = filterActivitiesByVendor(results, filters.vendorId);
  const priceMax = filters.priceMax;
  if (priceMax != null) {
    results = results.filter((a) => a.price <= priceMax);
  }
  if (filters.freeOnly) results = results.filter((a) => a.price === 0);
  if (filters.bookableOnly) results = results.filter((a) => a.requiresBooking);
  if (filters.openOnly) {
    results = results.filter((a) => a.outlet.open);
  }
  if (filters.openNow) {
    results = results.filter((a) => a.outlet.currentlyOpen ?? a.outlet.open);
  }
  if (filters.hoursMode === "at" && filters.timeAt) {
    results = results.filter((a) => isOperatingHoursAtAvailable(filters.timeAt!, a.outlet.operatingHours ?? null, filters.operatingDays ?? []));
  }
  if (filters.hoursMode !== "at" && filters.timeFrom && filters.timeTo) {
    results = results.filter((a) => isOperatingHoursWindowAvailable(
      filters.timeFrom!,
      filters.timeTo!,
      a.outlet.operatingHours ?? null,
      filters.operatingDays ?? [],
      { overnight: filters.overnight },
    ));
  }

  switch (filters.sort) {
    case "price_asc":
      results.sort((a, b) => a.price - b.price);
      break;
    case "rating_desc":
      results.sort((a, b) => b.rating - a.rating);
      break;
    case "distance_asc":
      results.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      break;
    default:
      results.sort((a, b) => b.rating * b.reviews - a.rating * a.reviews);
  }

  return results;
}

type ExploreTypeSelections = Map<string, Set<string>>;

function getExploreTypeSelections(filters: SearchFilters): ExploreTypeSelections {
  const selections = new Map<string, Set<string>>();
  for (const token of filters.types ?? []) {
    const separator = token.indexOf(":");
    if (separator < 1) continue;
    const category = canonicalCategorySlug(token.slice(0, separator));
    const type = token.slice(separator + 1);
    if (!category || !type || !CATEGORY_DETAILS[category].types.some((option) => option.slug === type)) continue;
    const types = selections.get(category) ?? new Set<string>();
    types.add(type);
    selections.set(category, types);
  }
  return selections;
}

function getExploreCategorySelections(filters: SearchFilters, typeSelections: ExploreTypeSelections): Set<string> {
  return new Set([
    ...(filters.categories ?? []),
    ...(filters.categorySlug ? [filters.categorySlug] : []),
    ...(filters.category ? [filters.category] : []),
    ...typeSelections.keys(),
  ].map(canonicalCategorySlug).filter((category): category is RealCategorySlug => category !== null));
}

function getExploreBadgeSelections(filters: SearchFilters): string[] {
  return [
    ...(filters.hiddenGemOnly ? ["hidden_gem"] : []),
    ...(filters.familyFriendlyOnly ? ["family_friendly"] : []),
    ...(filters.coupleFriendlyOnly ? ["couple_friendly"] : []),
  ];
}

function matchesExploreActivity(
  activity: Activity,
  outlet: Outlet,
  filters: SearchFilters,
  categorySelections: Set<string>,
  typeSelections: ExploreTypeSelections,
  badgeSelections: string[],
): boolean {
  const category = canonicalCategorySlug(activity.categorySlug);
  if (categorySelections.size > 0 && (!category || !categorySelections.has(category))) return false;

  if (typeSelections.size > 0) {
    const selectedTypes = category ? typeSelections.get(category) : undefined;
    if (!selectedTypes) return false;
    const availableTypes = category === "accommodation" ? outlet.accommodationTypeSlugs : activity.typeSlugs;
    if (!availableTypes?.some((type) => selectedTypes.has(type))) return false;
  }

  const query = filters.q?.trim().toLocaleLowerCase();
  if (query) {
    const productMatches = activity.name.toLocaleLowerCase().includes(query)
      || activity.category.toLocaleLowerCase().includes(query);
    const outletMatches = outlet.city.toLocaleLowerCase().includes(query)
      || outlet.state.toLocaleLowerCase().includes(query);
    if (!productMatches && !outletMatches) return false;
  }

  if (badgeSelections.length > 0 && !badgeSelections.some((badge) => outlet.badgeSlugs?.includes(badge))) return false;
  if (filters.state && filters.state !== "All Malaysia" && (activity.place?.state ?? outlet.state) !== filters.state) return false;
  if (filters.openNow && !(outlet.currentlyOpen ?? outlet.open)) return false;
  if (filters.vendorId && outlet.vendorId !== filters.vendorId) return false;
  return true;
}

function sortExploreActivities(filters: SearchFilters, activities: ComputedActivity[]): ComputedActivity[] {
  switch (filters.sort) {
    case "price_asc":
      activities.sort((a, b) => a.price - b.price);
      break;
    case "rating_desc":
      activities.sort((a, b) => b.rating - a.rating);
      break;
    case "distance_asc":
      activities.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      break;
    default:
      activities.sort((a, b) => b.rating * b.reviews - a.rating * a.reviews);
  }
  return activities;
}

/** Explore's facet groups combine with AND; selections within each group use OR. */
export function filterExploreActivities(filters: SearchFilters, activities: ComputedActivity[]): ComputedActivity[] {
  const typeSelections = getExploreTypeSelections(filters);
  const categorySelections = getExploreCategorySelections(filters, typeSelections);
  const badgeSelections = getExploreBadgeSelections(filters);
  const matching = activities.filter((activity) => matchesExploreActivity(
    activity,
    activity.outlet,
    filters,
    categorySelections,
    typeSelections,
    badgeSelections,
  ));
  return sortExploreActivities(filters, matching);
}

/**
 * Searches Explore with outlet-scoped filters applied before collapsing a
 * shared product to its one representative outlet and offer price.
 */
export async function searchExploreActivities(filters: SearchFilters, db: SupabaseClient = supabase): Promise<ComputedActivity[]> {
  const typeSelections = getExploreTypeSelections(filters);
  const categorySelections = getExploreCategorySelections(filters, typeSelections);
  const badgeSelections = getExploreBadgeSelections(filters);
  const { activities, outletMap } = await loadDiscoveryActivityData(db, badgeSelections);
  const matchingActivities = activities.flatMap((activity) => {
    const candidateOutletIds = [...new Set([
      ...(activity.offers ?? []).map((offer) => offer.outletId),
      activity.outletId,
    ].filter(Boolean))];
    const matchingOutlets = new Map<string, Outlet>();
    for (const outletId of candidateOutletIds) {
      const outlet = outletMap.get(outletId);
      if (outlet && matchesExploreActivity(activity, outlet, filters, categorySelections, typeSelections, badgeSelections)) {
        matchingOutlets.set(outlet.id, outlet);
      }
    }
    const computed = toComputed(activity, matchingOutlets, filters.near);
    return computed ? [computed] : [];
  });
  return sortExploreActivities(filters, matchingActivities);
}

export async function searchActivities(filters: SearchFilters, db: SupabaseClient = supabase): Promise<ComputedActivity[]> {
  const selectedBadgeSlugs = [
    ...(filters.hiddenGemOnly ? ["hidden_gem"] : []),
    ...(filters.familyFriendlyOnly ? ["family_friendly"] : []),
    ...(filters.coupleFriendlyOnly ? ["couple_friendly"] : []),
  ];
  const { activities, outletMap } = await loadDiscoveryActivityData(db, selectedBadgeSlugs);
  const computedActivities = activities
    .map((activity) => toComputed(activity, outletMap, filters.near))
    .filter((activity): activity is ComputedActivity => activity !== null);
  return filterComputedActivities(filters, computedActivities);
}

/** Keep discovery lean; only itinerary products need purchase variants and stock. */
export async function searchTripActivities(
  filters: SearchFilters,
  productIds: string[],
  db: SupabaseClient = supabase,
  discoveryData?: DiscoveryActivityData,
): Promise<ComputedActivity[]> {
  const [activities, products] = await Promise.all([
    discoveryData
      ? Promise.resolve(filterComputedActivities(filters, computeDiscoveryActivities(discoveryData, filters.near)))
      : searchActivities(filters, db),
    getActivitiesByIds(productIds, db),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  return activities.map((activity) => {
    const product = productsById.get(activity.id);
    if (!product) return activity;
    // Preserve the discovery outlet, price, distance and review metrics. Raw
    // inventory and checkout pricing rules do not belong in the Trip payload.
    return {
      ...activity,
      variants: product.variants,
      availableStock: product.stockByOutlet?.[activity.outlet.id] ?? product.availableStock,
      stockByOutlet: product.stockByOutlet,
    };
  });
}

// ─── Vouchers ───────────────────────────────────────────────────────────────
function mapVoucher(row: {
  id: string; vendor_id: string; outlet_id: string | null; code: string; name?: string | null; voucher_type: string; discount_value: number; min_spend: number | null;
  max_uses: number | null; uses_count: number; per_customer_limit?: number | null; valid_until: string | null;
  product_id?: string | null; buy_quantity?: number | null; free_quantity?: number | null;
}): Voucher {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    outletId: row.outlet_id ?? undefined,
    code: row.code,
    name: row.name ?? undefined,
    type: row.voucher_type as Voucher["type"],
    value: Number(row.discount_value),
    minSpend: Number(row.min_spend ?? 0),
    usageCap: row.max_uses ?? Infinity,
    usageCount: row.uses_count,
    perCustomerLimit: row.per_customer_limit ?? undefined,
    expiresAt: row.valid_until ?? "",
    productId: row.product_id ?? undefined,
    buyQuantity: row.buy_quantity ?? undefined,
    freeQuantity: row.free_quantity ?? undefined,
  };
}

export async function getVouchers(): Promise<Voucher[]> {
  const { data, error } = await supabase.from("vouchers").select("*").eq("is_active", true).eq("review_status", "approved").in("redemption_mode", ["online", "both"]);
  if (error) throw error;
  return (data ?? []).map(mapVoucher);
}

export async function getVoucherByCode(code: string): Promise<Voucher | undefined> {
  const { data, error } = await supabase.from("vouchers").select("*").ilike("code", code).eq("is_active", true).eq("review_status", "approved").in("redemption_mode", ["online", "both"]).maybeSingle();
  if (error) throw error;
  return data ? mapVoucher(data) : undefined;
}

// Customer selectors use canonical slugs. Hidden Gem is intentionally included
// here as a collection entry; searchActivities translates it to hiddenGemOnly.
export const CATEGORIES = DISCOVERY_CATEGORIES.map(({ slug, label, labelKey, icon }) => ({ id: slug, label, labelKey, icon }));
