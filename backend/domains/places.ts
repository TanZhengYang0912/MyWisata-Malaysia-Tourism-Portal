// Places domain — Penang place-first navigation (state > region > poi).
// See docs/plans/2026-08-12-2152-penang-place-model-and-data-reset.md §4.
// Reuses catalogue.ts's getActivities()/getVendors() instead of duplicating
// their query/mapping logic — catalogue.ts is explicitly out of scope for
// this plan (its outlet-collapsing toComputed() is correct for cards and
// wrong for a place's product list, which is why this domain has its own
// getPlaceProducts() rather than reusing searchActivities()).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/backend/supabase";
import { haversineKm } from "@/backend/core/helpers";
import type { Outlet, Place, PlaceLevel, PlaceProduct, PlaceRelation } from "@/backend/core/types";
import { getActivities, getOutlets, getVendors } from "@/backend/domains/catalogue";
import { placeImageUrl } from "@/lib/storage/place-image";

type PlaceRow = {
  id: string;
  parent_id: string | null;
  level: PlaceLevel;
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  image_url: string | null;
  state: string;
  district: string | null;
  lat: number | string;
  lng: number | string;
  entry_fee: number | string | null;
  managed_by_vendor_id: string | null;
  detail: Place["detail"];
};

const PLACES_SELECT =
  "id,parent_id,level,name,slug,tagline,intro,image_url,state,district,lat,lng,entry_fee,managed_by_vendor_id,detail";

// PostgREST serialises NUMERIC as a string — coerce every numeric column,
// same convention as mapActivity()'s place_lat/place_lng handling.
function mapPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    parentId: row.parent_id,
    level: row.level as Place["level"],
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    intro: row.intro,
    imageUrl: placeImageUrl(row.image_url),
    state: row.state,
    district: row.district,
    lat: Number(row.lat),
    lng: Number(row.lng),
    entryFee: row.entry_fee === null ? null : Number(row.entry_fee),
    managedByVendorId: row.managed_by_vendor_id,
    detail: row.detail,
  };
}

export async function getPlaceBySlug(slug: string, db: SupabaseClient = supabase): Promise<Place | null> {
  const { data, error } = await db
    .from("places")
    .select(PLACES_SELECT)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? mapPlace(data as unknown as PlaceRow) : null;
}

async function getPlaceById(id: string, db: SupabaseClient): Promise<Place | null> {
  const { data, error } = await db
    .from("places")
    .select(PLACES_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? mapPlace(data as unknown as PlaceRow) : null;
}

export async function getPlaceChildren(parentId: string, db: SupabaseClient = supabase): Promise<Place[]> {
  const { data, error } = await db
    .from("places")
    .select(PLACES_SELECT)
    .eq("parent_id", parentId)
    .eq("status", "active")
    .order("sort_order");
  if (error) throw error;
  return ((data ?? []) as unknown as PlaceRow[]).map(mapPlace);
}

const MAX_ANCESTOR_HOPS = 10;

/**
 * Root-first breadcrumb: [state, region, poi]. Capped at 10 hops — a cycle in
 * parent_id (which places_parent_shape should already prevent) would
 * otherwise walk forever and exhaust the heap.
 */
export async function getPlaceAncestors(slug: string, db: SupabaseClient = supabase): Promise<Place[]> {
  const target = await getPlaceBySlug(slug, db);
  if (!target) return [];

  const chain: Place[] = [target];
  let current = target;
  let hops = 0;
  while (current.parentId && hops < MAX_ANCESTOR_HOPS) {
    const parent = await getPlaceById(current.parentId, db);
    if (!parent) break;
    chain.push(parent);
    current = parent;
    hops += 1;
  }
  return chain.reverse();
}

export async function getRegionsWithPois(
  stateSlug: string,
  db: SupabaseClient = supabase,
): Promise<{ region: Place; pois: Place[] }[]> {
  const state = await getPlaceBySlug(stateSlug, db);
  if (!state) return [];

  const regions = await getPlaceChildren(state.id, db);
  if (regions.length === 0) return [];

  const { data, error } = await db
    .from("places")
    .select(PLACES_SELECT)
    .in("parent_id", regions.map((region) => region.id))
    .eq("status", "active")
    .eq("level", "poi")
    .order("sort_order");
  if (error) throw error;

  const pois = ((data ?? []) as unknown as PlaceRow[]).map(mapPlace);
  const poisByRegion = new Map<string, Place[]>();
  for (const poi of pois) {
    if (!poi.parentId) continue;
    const list = poisByRegion.get(poi.parentId) ?? [];
    list.push(poi);
    poisByRegion.set(poi.parentId, list);
  }

  return regions.map((region) => ({ region, pois: poisByRegion.get(region.id) ?? [] }));
}

type ProductPlaceRow = {
  product_id: string;
  relation_type: PlaceRelation;
  products: { vendor_id: string } | null;
};

/**
 * Every vendor product attached to a place, grouped by relation type on the
 * caller's side. Goes through getActivities() (all active+approved products)
 * rather than a place-scoped product query, since Activity's full mapping
 * (variants, price rules, review metrics) lives only in catalogue.ts.
 */
export async function getPlaceProducts(placeId: string, db: SupabaseClient = supabase): Promise<PlaceProduct[]> {
  const { data, error } = await db
    .from("product_places")
    .select("product_id,relation_type,products(vendor_id)")
    .eq("place_id", placeId);
  if (error) throw error;

  const links = (data ?? []) as unknown as ProductPlaceRow[];
  if (links.length === 0) return [];

  const relationByProduct = new Map(links.map((link) => [link.product_id, link.relation_type]));
  const vendorIdByProduct = new Map(links.map((link) => [link.product_id, link.products?.vendor_id]));

  const [activities, vendors] = await Promise.all([getActivities(db), getVendors(db)]);
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

  const result: PlaceProduct[] = [];
  for (const product of activities) {
    const relation = relationByProduct.get(product.id);
    if (!relation) continue;
    const vendor = vendorById.get(vendorIdByProduct.get(product.id) ?? "");
    if (!vendor) continue;
    result.push({ product, vendor, relation });
  }
  return result;
}

/**
 * Outlets within radiusKm of origin, nearest first. Reuses getOutlets()
 * rather than a dedicated bounding-box query — catalogue.ts's OUTLET_SELECT
 * isn't exported, and duplicating it isn't worth it at this catalogue's
 * scale (tens of outlets, not thousands).
 */
export async function getNearbyOutlets(
  origin: { lat: number; lng: number },
  radiusKm: number,
  db: SupabaseClient = supabase,
): Promise<{ outlet: Outlet; km: number }[]> {
  const outlets = await getOutlets(db);
  return outlets
    .map((outlet) => ({ outlet, km: haversineKm(origin, { lat: outlet.lat, lng: outlet.lng }) }))
    .filter((entry) => entry.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

/** States that have a places tree — drives the D7 fallback: render the new place-first page only when this includes the state, else fall through to the existing destination page. */
export async function getStatesWithPlaces(db: SupabaseClient = supabase): Promise<string[]> {
  const { data, error } = await db.from("places").select("state").eq("level", "state").eq("status", "active");
  if (error) throw error;
  return [...new Set(((data ?? []) as { state: string }[]).map((row) => row.state))];
}
