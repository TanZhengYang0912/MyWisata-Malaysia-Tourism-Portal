// Owner: Member 2 / catalogue side (Vendor/Outlet/Product)
import { supabase } from "@/backend/supabase";
import { haversineKm } from "@/backend/core/helpers";
import type { Activity, BookingSlot, ComputedActivity, Outlet, VendorSummary, Voucher } from "@/backend/core/types";

// ─── Vendors (approval lives here, not per-outlet — see VendorSummary) ─────
export async function getVendors(): Promise<VendorSummary[]> {
  const { data, error } = await supabase.from("vendors").select("id,name,status,outlets(id,name,city,state)");
  if (error) throw error;
  return (data ?? []).map((v) => ({ id: v.id, name: v.name, status: v.status, outlets: v.outlets ?? [] }));
}

export async function setVendorApproved(vendorId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.from("vendors").update({ status: approved ? "approved" : "rejected" }).eq("id", vendorId);
  if (error) throw error;
}

// ─── Outlets ────────────────────────────────────────────────────────────────
type OutletRow = {
  id: string;
  vendor_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  operating_hours: { hours?: string } | null;
  status: string;
  vendors: { status: string } | null;
  products: { categories: { name: string } | null }[] | null;
};

const OUTLET_SELECT = "id,vendor_id,name,address,city,state,lat,lng,operating_hours,status,vendors(status),products(categories(name))";

function mapOutlet(row: OutletRow): Outlet {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    name: row.name,
    category: row.products?.[0]?.categories?.name ?? "",
    state: row.state ?? "",
    city: row.city ?? "",
    address: row.address ?? "",
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    hours: row.operating_hours?.hours ?? "",
    verified: row.vendors?.status === "approved",
    open: row.status === "active",
    rating: 0,
    reviews: 0,
  };
}

export async function getOutlets(): Promise<Outlet[]> {
  const { data, error } = await supabase.from("outlets").select(OUTLET_SELECT);
  if (error) throw error;
  return (data as unknown as OutletRow[]).map(mapOutlet);
}

export async function getOutlet(id: string): Promise<Outlet | undefined> {
  const { data, error } = await supabase.from("outlets").select(OUTLET_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapOutlet(data as unknown as OutletRow) : undefined;
}

// ─── Products (activities) ─────────────────────────────────────────────────
type ProductRow = {
  id: string;
  outlet_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  base_price: number;
  requires_booking: boolean;
  categories: { name: string } | null;
  product_variants: { id: string; name: string; price_offset: number }[];
};

const ACTIVITY_SELECT = "id,outlet_id,name,description,cover_url,base_price,requires_booking,categories(name),product_variants(id,name,price_offset)";

function mapActivity(row: ProductRow): Activity {
  return {
    id: row.id,
    outletId: row.outlet_id,
    name: row.name,
    category: row.categories?.name ?? "",
    description: row.description ?? "",
    image: row.cover_url ?? "",
    price: Number(row.base_price),
    rating: 0,
    reviews: 0,
    duration: "",
    requiresBooking: row.requires_booking,
    variants: (row.product_variants ?? []).map((v) => ({ id: v.id, label: v.name, priceDelta: Number(v.price_offset) })),
  };
}

export async function getActivities(): Promise<Activity[]> {
  const { data, error } = await supabase.from("products").select(ACTIVITY_SELECT);
  if (error) throw error;
  return (data as unknown as ProductRow[]).map(mapActivity);
}

export async function getBookingSlots(activityId: string): Promise<BookingSlot[]> {
  const { data, error } = await supabase.from("booking_slots").select("*").eq("product_id", activityId).order("starts_at");
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, activityId: s.product_id, startsAt: s.starts_at, capacity: s.capacity, booked: s.booked }));
}

function toComputed(activity: Activity, outlet: Outlet | undefined, from?: { lat: number; lng: number }): ComputedActivity | null {
  if (!outlet) return null;
  return { ...activity, outlet, distanceKm: from ? haversineKm(from, { lat: outlet.lat, lng: outlet.lng }) : undefined };
}

async function getComputedActivities(from?: { lat: number; lng: number }): Promise<ComputedActivity[]> {
  const [activities, outlets] = await Promise.all([getActivities(), getOutlets()]);
  const outletMap = new Map(outlets.map((o) => [o.id, o]));
  return activities
    .map((a) => toComputed(a, outletMap.get(a.outletId), from))
    .filter((a): a is ComputedActivity => a !== null);
}

export async function getComputedActivity(id: string, from?: { lat: number; lng: number }): Promise<ComputedActivity | null> {
  const all = await getComputedActivities(from);
  return all.find((a) => a.id === id) ?? null;
}

export interface SearchFilters {
  q?: string;
  category?: string | null;
  state?: string | null;
  priceMax?: number;
  openOnly?: boolean;
  near?: { lat: number; lng: number };
  sort?: "recommended" | "price_asc" | "rating_desc" | "distance_asc";
}

export async function searchActivities(filters: SearchFilters): Promise<ComputedActivity[]> {
  let results = await getComputedActivities(filters.near);

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
  if (filters.category) {
    results = results.filter((a) => a.category === filters.category);
  }
  if (filters.state && filters.state !== "All Malaysia") {
    results = results.filter((a) => a.outlet.state === filters.state);
  }
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
  id: string; code: string; voucher_type: string; discount_value: number; min_spend: number | null;
  max_uses: number | null; uses_count: number; valid_until: string | null;
}): Voucher {
  return {
    id: row.id,
    code: row.code,
    type: row.voucher_type as Voucher["type"],
    value: Number(row.discount_value),
    minSpend: Number(row.min_spend ?? 0),
    usageCap: row.max_uses ?? Infinity,
    usageCount: row.uses_count,
    expiresAt: row.valid_until ?? "",
  };
}

export async function getVouchers(): Promise<Voucher[]> {
  const { data, error } = await supabase.from("vouchers").select("*");
  if (error) throw error;
  return (data ?? []).map(mapVoucher);
}

export async function getVoucherByCode(code: string): Promise<Voucher | undefined> {
  const { data, error } = await supabase.from("vouchers").select("*").ilike("code", code).maybeSingle();
  if (error) throw error;
  return data ? mapVoucher(data) : undefined;
}

export const CATEGORIES = [
  { id: "Food & Dining", label: "Food & Dining", icon: "🍜" },
  { id: "Island & Beach", label: "Island & Beach", icon: "🏝" },
  { id: "Heritage & Culture", label: "Heritage & Culture", icon: "🏛" },
  { id: "Nature & Hiking", label: "Nature & Hiking", icon: "🌿" },
  { id: "Shopping & Retail", label: "Shopping & Retail", icon: "🛍" },
  { id: "Wellness & Spa", label: "Wellness & Spa", icon: "🧘" },
  { id: "Nature & Leisure", label: "Nature & Leisure", icon: "🍵" },
];

export const STATES_MY = [
  "All Malaysia", "Kuala Lumpur", "Penang", "Melaka", "Kedah", "Sabah", "Pahang",
];
