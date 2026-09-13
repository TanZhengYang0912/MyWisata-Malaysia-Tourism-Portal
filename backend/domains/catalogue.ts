// Owner: Member 2 / catalogue side (Vendor/Outlet/Product)
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/backend/supabase";
import { haversineKm } from "@/backend/core/helpers";
import type { Activity, BookingSlot, ComputedActivity, OperatingHourWeekday, OperatingHours, Outlet, PlaceLocation, PriceRule, ProductReview, VendorSummary, Voucher } from "@/backend/core/types";
import type { ReviewMetric } from "@/backend/domains/review-metrics";
import { toProductReview } from "@/backend/domains/review-presenter";
import { filterActivitiesByVendor } from "@/backend/domains/catalogue-filters";
import {
  canonicalCategorySlug,
  DISCOVERY_CATEGORIES,
  getDiscoveryCategoryLabel,
  type RealCategorySlug,
} from "@/lib/customer/discovery-categories";
import { productImageUrl } from "@/lib/storage/product-image";
import { getMalaysiaTodayKey, getOperatingHoursPeriods, isOperatingHoursAtAvailable, isOperatingHoursOpenNow, isOperatingHoursWindowAvailable } from "@/lib/customer/operating-hours";

export { STATES_MY } from "@/lib/customer/malaysia-states";

export { aggregateReviewMetrics } from "@/backend/domains/review-metrics";

const REVIEW_METRICS_BATCH_SIZE = 100;

// ─── Vendors (approval lives here, not per-outlet — see VendorSummary) ─────
export async function getVendors(db: SupabaseClient = supabase): Promise<VendorSummary[]> {
  const { data, error } = await db.from("vendors").select("id,name,status,logo_url,cover_url,outlets(id,name,city,state,status,review_status)");
  if (error) throw error;
  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status,
    logoUrl: v.logo_url,
    coverUrl: v.cover_url,
    outlets: (v.outlets ?? []).filter((outlet) =>
      (!outlet.status || outlet.status === "active") &&
      (!outlet.review_status || outlet.review_status === "approved"),
    ),
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
  outlet_pages: { hero_url: string | null } | { hero_url: string | null }[] | null;
  vendors: {
    name: string | null;
    status: string;
    products: { categories: { name: string; slug: string | null } | null }[] | null;
  } | null;
};

const OUTLET_SELECT = "id,vendor_id,name,address,city,state,lat,lng,operating_hours,phone,status,wheelchair_accessible,pet_friendly,outlet_pages(hero_url),vendors(name,status,products(categories(name,slug)))";

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
  };
}

export async function getOutlets(db: SupabaseClient = supabase): Promise<Outlet[]> {
  const { data, error } = await db
    .from("outlets")
    .select(OUTLET_SELECT)
    .eq("status", "active")
    .eq("review_status", "approved");
  if (error) throw error;
  return (data as unknown as OutletRow[]).map(mapOutlet);
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
}

/**
 * The outlets a product can actually be bought from, with each outlet's own
 * price. Returns a single entry for a normal single-outlet product, so the
 * product page can treat both shapes identically.
 */
export async function getOutletChoices(activity: Activity, db: SupabaseClient = supabase): Promise<OutletChoice[]> {
  if (!activity.offers?.length) return [];
  const [outlets, reviewMetrics] = await Promise.all([
    getOutlets(db),
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
 * Product ids an outlet sells: the ones it owns directly, plus the shared
 * vendor products it has an offer for. Use this instead of filtering
 * `products.outlet_id`, which alone misses every multi-outlet product.
 */
export async function getOutletProductIds(db: SupabaseClient, outletId: string, candidateIds?: string[]): Promise<Set<string>> {
  let ownQuery = db.from("products").select("id").eq("outlet_id", outletId);
  let offerQuery = db.from("outlet_offers").select("product_id").eq("outlet_id", outletId).eq("status", "active");
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
  outlet_id: string | null;
  outlet_offers?: { outlet_id: string; price: number; status: string }[] | null;
  name: string;
  description: string | null;
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
  product_variants: { id: string; name: string; price_offset: number; inventory?: { quantity: number; reserved: number; low_stock_threshold: number }[] }[];
  price_rules: { id: string; rule_type: PriceRule["ruleType"]; label: string | null; multiplier: number | null; fixed_amount: number | null; valid_from: string | null; valid_until: string | null; min_quantity: number | null; bundle_product_ids: string[] | null; priority: number; is_active: boolean }[];
};

const ACTIVITY_SELECT = "id,outlet_id,name,description,cover_url,base_price,requires_booking,status,review_status,tags,created_at,attributes,is_hidden_gem,type_slugs,is_family_friendly,is_couple_friendly,place_state,place_district,place_lat,place_lng,categories(name,slug),outlet_offers(outlet_id,price,status),product_variants(id,name,price_offset,inventory(quantity,reserved,low_stock_threshold)),price_rules(id,rule_type,label,multiplier,fixed_amount,valid_from,valid_until,min_quantity,bundle_product_ids,priority,is_active)";

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
    variants: (row.product_variants ?? []).map((v) => ({ id: v.id, label: v.name, priceDelta: Number(v.price_offset) })),
    priceRules: (row.price_rules ?? []).filter((rule) => rule.is_active).map((rule) => ({ id: rule.id, productId: row.id, ruleType: rule.rule_type, label: rule.label ?? undefined, multiplier: rule.multiplier === null ? undefined : Number(rule.multiplier), fixedAmount: rule.fixed_amount === null ? undefined : Number(rule.fixed_amount), validFrom: rule.valid_from ?? undefined, validUntil: rule.valid_until ?? undefined, minQuantity: rule.min_quantity ?? undefined, bundleProductIds: rule.bundle_product_ids ?? undefined, priority: Number(rule.priority ?? 0), isActive: rule.is_active })),
    availableStock: row.requires_booking ? undefined : (row.product_variants ?? []).reduce((total, variant) => total + Math.max(0, Number(variant.inventory?.[0]?.quantity ?? 0) - Number(variant.inventory?.[0]?.reserved ?? 0)), 0),
    lowStockThreshold: row.requires_booking ? undefined : (row.product_variants ?? []).reduce((threshold, variant) => Math.max(threshold, Number(variant.inventory?.[0]?.low_stock_threshold ?? 5)), 0),
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
  const metricRows = (await Promise.all(
    Array.from({ length: Math.ceil(productIds.length / REVIEW_METRICS_BATCH_SIZE) }, (_, index) => {
      const batch = productIds.slice(index * REVIEW_METRICS_BATCH_SIZE, (index + 1) * REVIEW_METRICS_BATCH_SIZE);
      return db
        .from("product_review_metrics")
        .select("product_id,rating,reviews")
        .in("product_id", batch)
        .then(({ data: batchRows, error: reviewError }) => {
          if (reviewError) throw reviewError;
          return batchRows ?? [];
        });
    }),
  )).flat();

  const reviewMetrics = new Map(
    ((metricRows ?? []) as { product_id: string; rating: number | string; reviews: number | string }[])
      .map((row) => [row.product_id, { rating: Number(row.rating), reviews: Number(row.reviews) }]),
  );
  return rows.map((row) => mapActivity(row, reviewMetrics.get(row.id)));
}

export async function getBookingSlots(activityId: string, db: SupabaseClient = supabase): Promise<BookingSlot[]> {
  const { data, error } = await db.from("booking_slots").select("id,product_id,starts_at,ends_at,capacity,booked,status,price_override").eq("product_id", activityId).order("starts_at");
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, activityId: s.product_id, startsAt: s.starts_at, endsAt: s.ends_at, capacity: s.capacity, booked: s.booked, status: s.status, priceOverride: s.price_override === null ? undefined : Number(s.price_override) }));
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

export async function getProductReviewsPage(
  productId: string,
  options: { page?: number; pageSize?: number; outletId?: string } = {},
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
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.floor(Number(options.page ?? 1));
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1));
  const offset = (page - 1) * pageSize;

  let dataQuery = db
    .from("reviews")
    .select("id,rating,title,body,created_at,users(full_name)")
    .eq("product_id", productId)
    .eq("is_visible", true);
  if (options.outletId) dataQuery = dataQuery.eq("outlet_id", options.outletId);
  const { data, error } = await dataQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;

  return {
    items: (data ?? []).map((row) => toProductReview(row as unknown as Parameters<typeof toProductReview>[0])),
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
  const best = from
    ? scored.reduce((a, b) => ((b.distanceKm ?? Infinity) < (a.distanceKm ?? Infinity) ? b : a))
    : scored.reduce((a, b) => (b.offer.price < a.offer.price ? b : a));

  return {
    ...activity,
    outletId: best.outlet.id,
    price: best.offer.price,
    outlet: best.outlet,
    distanceKm: best.distanceKm,
  };
}

async function getComputedActivities(from?: { lat: number; lng: number }, db: SupabaseClient = supabase): Promise<ComputedActivity[]> {
  const [activities, outlets] = await Promise.all([getActivities(db), getOutlets(db)]);
  const outletMap = new Map(outlets.map((o) => [o.id, o]));
  return activities
    .map((a) => toComputed(a, outletMap, from))
    .filter((a): a is ComputedActivity => a !== null);
}

/**
 * One product plus only the outlets it actually sells at. Deliberately does not
 * go through getComputedActivities(): that pulls the entire catalogue and every
 * outlet just to .find() a single row, so opening one product page — or one
 * wishlist entry — scanned the whole table (H4).
 */
export async function getComputedActivity(id: string, from?: { lat: number; lng: number }, db: SupabaseClient = supabase): Promise<ComputedActivity | null> {
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

  return toComputed(activity, outletMap, from);
}

/** Products sold by one outlet, with the outlet's own offer price applied. */
export async function getOutletActivities(outletId: string, excludeProductId?: string, db: SupabaseClient = supabase): Promise<ComputedActivity[]> {
  const [activities, outlets] = await Promise.all([getActivities(db), getOutlets(db)]);
  const outlet = outlets.find((candidate) => candidate.id === outletId);
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
  const [activities, outlets] = await Promise.all([getActivities(db), getOutlets(db)]);
  const vendorOutlets = outlets.filter((o) => o.vendorId === vendorId);
  if (vendorOutlets.length === 0) return [];
  const outletMap = new Map(outlets.map((o) => [o.id, o]));
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

export async function searchActivities(filters: SearchFilters, db: SupabaseClient = supabase): Promise<ComputedActivity[]> {
  let results = await getComputedActivities(filters.near, db);

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
      (filters.hiddenGemOnly && activity.isHiddenGem) ||
      (filters.familyFriendlyOnly && activity.isFamilyFriendly) ||
      (filters.coupleFriendlyOnly && activity.isCoupleFriendly),
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

// ─── Vouchers ───────────────────────────────────────────────────────────────
function mapVoucher(row: {
  id: string; code: string; name?: string | null; voucher_type: string; discount_value: number; min_spend: number | null;
  max_uses: number | null; uses_count: number; per_customer_limit?: number | null; valid_until: string | null;
  product_id?: string | null; buy_quantity?: number | null; free_quantity?: number | null;
}): Voucher {
  return {
    id: row.id,
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
