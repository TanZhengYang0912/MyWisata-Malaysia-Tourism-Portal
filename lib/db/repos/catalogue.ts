// Owner: Member 2 / catalogue side (Vendor/Outlet/Product)
import { getCollection, KEYS, setCollection } from "../index";
import { haversineKm } from "@/lib/helpers";
import type { Activity, BookingSlot, ComputedActivity, Outlet, Voucher } from "@/lib/types";

export function getOutlets(): Outlet[] {
  return getCollection<Outlet>(KEYS.outlets);
}

export function getOutlet(id: string): Outlet | undefined {
  return getOutlets().find((o) => o.id === id);
}

/** Admin approval proxy: toggles an outlet's verified (approved) status. */
export function setOutletVerified(id: string, verified: boolean): void {
  const outlets = getOutlets();
  setCollection(KEYS.outlets, outlets.map((o) => (o.id === id ? { ...o, verified } : o)));
}

export function getActivities(): Activity[] {
  return getCollection<Activity>(KEYS.activities);
}

export function getBookingSlots(activityId: string): BookingSlot[] {
  return getCollection<BookingSlot>(KEYS.bookingSlots).filter((s) => s.activityId === activityId);
}

export function toComputed(activity: Activity, from?: { lat: number; lng: number }): ComputedActivity | null {
  const outlet = getOutlet(activity.outletId);
  if (!outlet) return null;
  return {
    ...activity,
    outlet,
    distanceKm: from ? haversineKm(from, { lat: outlet.lat, lng: outlet.lng }) : undefined,
  };
}

export function getComputedActivities(from?: { lat: number; lng: number }): ComputedActivity[] {
  return getActivities()
    .map((a) => toComputed(a, from))
    .filter((a): a is ComputedActivity => a !== null);
}

export function getComputedActivity(id: string, from?: { lat: number; lng: number }): ComputedActivity | null {
  const activity = getActivities().find((a) => a.id === id);
  if (!activity) return null;
  return toComputed(activity, from);
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

export function searchActivities(filters: SearchFilters): ComputedActivity[] {
  let results = getComputedActivities(filters.near);

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

export function getVouchers(): Voucher[] {
  return getCollection<Voucher>(KEYS.vouchers);
}

export function getVoucherByCode(code: string): Voucher | undefined {
  return getVouchers().find((v) => v.code.toUpperCase() === code.toUpperCase());
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
