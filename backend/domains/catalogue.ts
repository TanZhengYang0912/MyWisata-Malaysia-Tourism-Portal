// Owner: Member 2 / catalogue side (Vendor/Outlet/Product)
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/backend/supabase";
import { haversineKm } from "@/backend/core/helpers";
import type { Activity, BookingSlot, ComputedActivity, Outlet, PriceRule, ProductReview, VendorSummary, Voucher } from "@/backend/core/types";
import { aggregateReviewMetrics } from "@/backend/domains/review-metrics";
import type { ReviewMetric } from "@/backend/domains/review-metrics";
import { toProductReview } from "@/backend/domains/review-presenter";
import { filterActivitiesByVendor } from "@/backend/domains/catalogue-filters";
import {
  canonicalCategorySlug,
  DISCOVERY_CATEGORIES,
  getDiscoveryCategoryLabel,
  type RealCategorySlug,
} from "@/lib/customer/discovery-categories";

export { aggregateReviewMetrics } from "@/backend/domains/review-metrics";

// ─── Vendors (approval lives here, not per-outlet — see VendorSummary) ─────
export async function getVendors(db: SupabaseClient = supabase): Promise<VendorSummary[]> {
  const { data, error } = await db.from("vendors").select("id,name,status,outlets(id,name,city,state)");
  if (error) throw error;
  return (data ?? []).map((v) => ({ id: v.id, name: v.name, status: v.status, outlets: v.outlets ?? [] }));
}

export async function setVendorApproved(vendorId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.from("vendors").update({ status: approved ? "approved" : "rejected" }).eq("id", vendorId);
  if (error) throw error;
}

// ─── Outlets ────────────────────────────────────────────────────────────────
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type OperatingHours = Partial<Record<(typeof WEEKDAY_KEYS)[number], { open?: string; close?: string }>>;

function formatTodayHours(hours: OperatingHours | null): string {
  if (!hours) return "";
  const today = hours[WEEKDAY_KEYS[new Date().getDay()]] ?? Object.values(hours)[0];
  return today?.open && today?.close ? `${today.open} – ${today.close}` : "";
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
  vendors: { name: string | null; status: string } | null;
  products: { categories: { name: string; slug: string | null } | null }[] | null;
};

const OUTLET_SELECT = "id,vendor_id,name,address,city,state,lat,lng,operating_hours,phone,status,wheelchair_accessible,pet_friendly,vendors(name,status),products(categories(name,slug))";

function mapOutlet(row: OutletRow): Outlet {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: row.vendors?.name ?? undefined,
    name: row.name,
    category: row.products?.[0]?.categories?.slug
      ? getDiscoveryCategoryLabel(row.products[0].categories.slug)
      : row.products?.[0]?.categories?.name ?? "",
    state: row.state ?? "",
    city: row.city ?? "",
    address: row.address ?? "",
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    hours: formatTodayHours(row.operating_hours),
    phone: row.phone ?? undefined,
    verified: row.vendors?.status === "approved",
    open: row.status === "active",
    rating: 0,
    reviews: 0,
    wheelchairAccessible: row.wheelchair_accessible,
    petFriendly: row.pet_friendly,
  };
}

export async function getOutlets(db: SupabaseClient = supabase): Promise<Outlet[]> {
  const { data, error } = await db.from("outlets").select(OUTLET_SELECT);
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
}

/**
 * The outlets a product can actually be bought from, with each outlet's own
 * price. Returns a single entry for a normal single-outlet product, so the
 * product page can treat both shapes identically.
 */
export async function getOutletChoices(activity: Activity, db: SupabaseClient = supabase): Promise<OutletChoice[]> {
  if (!activity.offers?.length) return [];
  const outlets = await getOutlets(db);
  const byId = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  return activity.offers
    .map((offer) => {
      const outlet = byId.get(offer.outletId);
      return outlet
        ? { outletId: outlet.id, outletName: outlet.name, city: outlet.city, price: offer.price, open: outlet.open }
        : null;
    })
    .filter((choice): choice is OutletChoice => choice !== null)
    .sort((a, b) => a.price - b.price);
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
  const { data, error } = await supabase.from("outlets").select(OUTLET_SELECT).eq("id", id).maybeSingle();
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
  categories: { name: string; slug: string } | null;
  product_variants: { id: string; name: string; price_offset: number; inventory?: { quantity: number; reserved: number; low_stock_threshold: number }[] }[];
  price_rules: { id: string; rule_type: PriceRule["ruleType"]; label: string | null; multiplier: number | null; fixed_amount: number | null; valid_from: string | null; valid_until: string | null; min_quantity: number | null; bundle_product_ids: string[] | null; priority: number; is_active: boolean }[];
};

const ACTIVITY_SELECT = "id,outlet_id,name,description,cover_url,base_price,requires_booking,status,review_status,tags,created_at,attributes,is_hidden_gem,type_slugs,is_family_friendly,is_couple_friendly,categories(name,slug),outlet_offers(outlet_id,price,status),product_variants(id,name,price_offset,inventory(quantity,reserved,low_stock_threshold)),price_rules(id,rule_type,label,multiplier,fixed_amount,valid_from,valid_until,min_quantity,bundle_product_ids,priority,is_active)";

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

  return {
    id: row.id,
    outletId: row.outlet_id ?? cheapest?.outletId ?? "",
    offers: offers.length ? offers : undefined,
    name: row.name,
    category: canonicalCategorySlug(row.categories?.slug) ? getDiscoveryCategoryLabel(row.categories?.slug) : row.categories?.name ?? "",
    description: row.description ?? "",
    image: row.cover_url ?? "",
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

  const { data: reviewRows, error: reviewError } = await db
    .from("reviews")
    .select("product_id,rating")
    .eq("is_visible", true)
    .in("product_id", rows.map((row) => row.id));
  if (reviewError) throw reviewError;

  const reviewMetrics = aggregateReviewMetrics(reviewRows ?? []);
  return rows.map((row) => mapActivity(row, reviewMetrics.get(row.id)));
}

export async function getBookingSlots(activityId: string, db: SupabaseClient = supabase): Promise<BookingSlot[]> {
  const { data, error } = await db.from("booking_slots").select("id,product_id,starts_at,capacity,booked,status,price_override").eq("product_id", activityId).order("starts_at");
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, activityId: s.product_id, startsAt: s.starts_at, capacity: s.capacity, booked: s.booked, status: s.status, priceOverride: s.price_override === null ? undefined : Number(s.price_override) }));
}

export async function getProductReviews(productId: string, db: SupabaseClient = supabase): Promise<ProductReview[]> {
  return (await getProductReviewsPage(productId, { page: 1, pageSize: 3 }, db)).items;
}

export interface ProductReviewPage {
  items: ProductReview[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getProductReviewsPage(
  productId: string,
  options: { page?: number; pageSize?: number } = {},
  db: SupabaseClient = supabase,
): Promise<ProductReviewPage> {
  const requestedPageSize = Math.floor(Number(options.pageSize ?? 5));
  const pageSize = Math.min(10, Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 5));
  const { count, error: countError } = await db
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("is_visible", true);
  if (countError) throw countError;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.floor(Number(options.page ?? 1));
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1));
  const offset = (page - 1) * pageSize;
  const { data, error } = await db
    .from("reviews")
    .select("id,rating,title,body,created_at,users(full_name)")
    .eq("product_id", productId)
    .eq("is_visible", true)
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

export async function getComputedActivity(id: string, from?: { lat: number; lng: number }, db: SupabaseClient = supabase): Promise<ComputedActivity | null> {
  const all = await getComputedActivities(from, db);
  return all.find((a) => a.id === id) ?? null;
}

export interface SearchFilters {
  q?: string;
  /** Canonical real category slug; legacy display-name callers may use category. */
  categorySlug?: RealCategorySlug | null;
  category?: string | null;
  hiddenGemOnly?: boolean;
  state?: string | null;
  vendorId?: string | null;
  priceMax?: number;
  openOnly?: boolean;
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
  if (filters.categorySlug) results = results.filter((a) => a.categorySlug === filters.categorySlug);
  if (filters.category) {
    const canonical = canonicalCategorySlug(filters.category);
    results = results.filter((a) => canonical ? a.categorySlug === canonical : a.category === filters.category);
  }
  if (filters.hiddenGemOnly) results = results.filter((a) => a.isHiddenGem);
  if (filters.state && filters.state !== "All Malaysia") {
    results = results.filter((a) => a.outlet.state === filters.state);
  }
  results = filterActivitiesByVendor(results, filters.vendorId);
  if (filters.priceMax !== undefined) {
    results = results.filter((a) => a.price <= filters.priceMax!);
  }
  if (filters.openOnly) {
    results = results.filter((a) => a.outlet.open);
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
  const { data, error } = await supabase.from("vouchers").select("*");
  if (error) throw error;
  return (data ?? []).map(mapVoucher);
}

export async function getVoucherByCode(code: string): Promise<Voucher | undefined> {
  const { data, error } = await supabase.from("vouchers").select("*").ilike("code", code).eq("is_active", true).eq("review_status", "approved").maybeSingle();
  if (error) throw error;
  return data ? mapVoucher(data) : undefined;
}

// Customer selectors use canonical slugs. Hidden Gem is intentionally included
// here as a collection entry; searchActivities translates it to hiddenGemOnly.
export const CATEGORIES = DISCOVERY_CATEGORIES.map(({ slug, label, icon }) => ({ id: slug, label, icon }));

export const STATES_MY = [
  "All Malaysia", "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis",
  "Penang", "Sabah", "Sarawak", "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan",
];
