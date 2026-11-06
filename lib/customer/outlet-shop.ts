import { formatMYRNumber } from "@/lib/i18n/format";
import { round2 } from "@/backend/core/money";
import { orderProductCatalogue } from '@/lib/customer/product-catalogue';

export interface PublicOutletEmptyState {
  title: string;
  body: string;
}

export interface PublicOutletProfileInput {
  outletName: string;
  vendorName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  operatingHours?: unknown;
  introTitle?: string;
  introBody?: string;
}

export interface PublicOutletProfile {
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  operatingHours: unknown;
  introTitle: string;
  introBody: string;
}

export interface OutletProductActionInput {
  requiresBooking: boolean;
  variantId?: string | null;
  firstAvailableSlotId?: string | null;
  availableStock?: number | null;
}

export type OutletProductAction =
  | { kind: 'cart'; variantId: string; slotId?: string }
  | { kind: 'details'; reason: 'slot_required' | 'selection_required' | 'out_of_stock' };

export interface OutletInventoryVariant {
  is_active?: boolean | null;
  inventory?: readonly {
    outlet_id: string;
    quantity?: number | string | null;
    reserved?: number | string | null;
  }[] | null;
}

export interface OutletSelectableVariant extends OutletInventoryVariant {
  id: string;
  is_default?: boolean | null;
  is_active?: boolean | null;
}

export interface SelectedOutletStockInput {
  outletId: string;
  offers?: readonly { outletId: string }[];
  availableStock?: number;
  stockByOutlet?: Record<string, number>;
  requiresBooking: boolean;
}

export interface OutletProductCardModelInput {
  outletName: string;
  productName: string;
  basePrice: number;
  category?: string | null;
  productType?: string | null;
  requiresBooking?: boolean;
  availableStock?: number | null;
  rating?: number;
  reviews?: number;
  hasCartAction: boolean;
}

export interface OutletProductCardModel {
  categoryLabel: string;
  priceLabel: string;
  descriptionFallback: string;
  availabilityLabel: string;
  ratingLabel?: string;
  locationLabel: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
}

export type OutletProductDetailReason = 'slot_required' | 'selection_required' | 'out_of_stock';

export interface OutletNavigationItem {
  id: string;
  name: string;
}

export interface OutletNavigationModel {
  currentPosition: number;
  total: number;
  hasMultipleOutlets: boolean;
}

const DEFAULT_OPERATING_HOURS = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '20:00' },
  sat: { open: '09:00', close: '20:00' },
  sun: { open: '10:00', close: '18:00' },
};

function clean(value?: string | null) {
  return value?.trim() || '';
}

/** PostgREST joins may be typed as arrays while a many-to-one relation is returned as an object. */
export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function getOutletAvailableStock(variants: readonly OutletInventoryVariant[], outletId: string): number {
  return variants
    .filter((variant) => variant.is_active !== false)
    .flatMap((variant) => variant.inventory ?? [])
    .filter((inventory) => inventory.outlet_id === outletId)
    .reduce((total, inventory) => total + Math.max(0, Number(inventory.quantity ?? 0) - Number(inventory.reserved ?? 0)), 0);
}

export function getActiveDefaultOutletVariant<T extends OutletSelectableVariant>(variants: readonly T[], outletId?: string): T | null {
  const activeVariants = variants.filter((variant) => variant.is_active !== false);
  const selectableVariants = outletId
    ? activeVariants.filter((variant) => (variant.inventory ?? []).some((inventory) =>
      inventory.outlet_id === outletId
      && Math.max(0, Number(inventory.quantity ?? 0) - Number(inventory.reserved ?? 0)) > 0
    ))
    : activeVariants;
  return selectableVariants.find((variant) => variant.is_default) ?? selectableVariants[0] ?? null;
}

export function getOutletVariantPrice(basePrice: number, priceOffset?: number | string | null): number {
  return round2(basePrice + Number(priceOffset ?? 0));
}

export function getSelectedOutletStock(activity: SelectedOutletStockInput | null, outletId: string): number | undefined {
  if (!activity || activity.requiresBooking) return undefined;
  if (activity.stockByOutlet && Object.prototype.hasOwnProperty.call(activity.stockByOutlet, outletId)) {
    return activity.stockByOutlet[outletId];
  }
  if (activity.offers?.some((offer) => offer.outletId === outletId)) return 0;
  return activity.outletId === outletId ? activity.availableStock : undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildPublicOutletProfile(input: PublicOutletProfileInput): PublicOutletProfile {
  const city = clean(input.city) || 'Malaysia';
  const state = clean(input.state) || city;
  const country = clean(input.country) || 'Malaysia';
  const address = clean(input.address) || [city, state, country].filter(Boolean).join(', ');
  const vendorName = clean(input.vendorName) || clean(input.outletName) || 'Local partner';

  return {
    address,
    city,
    state,
    country,
    phone: clean(input.phone) || '+60 3-5555 0199',
    email: clean(input.email) || `hello+${slugify(input.outletName) || 'mylawatan-outlet'}@demo.local`,
    operatingHours: input.operatingHours && typeof input.operatingHours === 'object'
      ? input.operatingHours
      : DEFAULT_OPERATING_HOURS,
    introTitle: clean(input.introTitle) || 'A local day, made memorable',
    introBody: clean(input.introBody) || `Discover ${vendorName} in ${city}: local favourites, thoughtful hosts and experiences designed around this place.`,
  };
}

export function getOutletProductAction(input: OutletProductActionInput): OutletProductAction {
  if (input.availableStock === 0) return { kind: 'details', reason: 'out_of_stock' };
  if (input.requiresBooking) {
    return { kind: 'details', reason: 'slot_required' };
  }

  const variantId = clean(input.variantId);
  const slotId = clean(input.firstAvailableSlotId);
  if (!variantId && !slotId) return { kind: 'details', reason: 'selection_required' };

  return {
    kind: 'cart',
    variantId,
    ...(slotId ? { slotId } : {}),
  };
}

export function getOutletDetailActionLabel(reason: OutletProductDetailReason) {
  if (reason === 'slot_required') return 'Choose a time';
  if (reason === 'selection_required') return 'Choose options';
  return 'View details';
}

export function getOutletNavigationModel(
  outlets: readonly OutletNavigationItem[],
  currentOutletId: string,
): OutletNavigationModel {
  const uniqueOutlets = outlets.filter((outlet, index, all) => all.findIndex((candidate) => candidate.id === outlet.id) === index);
  const currentIndex = uniqueOutlets.findIndex((outlet) => outlet.id === currentOutletId);

  return {
    currentPosition: currentIndex >= 0 ? currentIndex + 1 : 1,
    total: uniqueOutlets.length,
    hasMultipleOutlets: uniqueOutlets.length > 1,
  };
}

export function buildOutletProductCardModel(input: OutletProductCardModelInput): OutletProductCardModel {
  const requiresBooking = Boolean(input.requiresBooking);
  const categoryLabel = clean(input.category) || (requiresBooking
    ? 'Experience'
    : input.productType === 'food'
      ? 'Food & drink'
      : input.productType === 'activity'
        ? 'Activity'
        : 'Local product');
  const availabilityLabel = !input.hasCartAction && input.availableStock === 0
    ? 'Out of stock'
    : requiresBooking
      ? 'Booking required'
      : input.availableStock != null
        ? `${input.availableStock} available`
        : 'Available to explore';
  const ratingLabel = input.rating && input.rating > 0
    ? `${input.rating.toFixed(1)} (${input.reviews ?? 0})`
    : undefined;
  const actionLabel = input.hasCartAction
    ? requiresBooking ? 'Add booking' : 'Add to cart'
    : 'View details';

  return {
    categoryLabel,
    priceLabel: `From RM${formatMYRNumber(Number(input.basePrice))}`,
    descriptionFallback: `A local favourite from ${input.outletName}.`,
    availabilityLabel,
    ratingLabel,
    locationLabel: `Available at ${input.outletName}`,
    primaryActionLabel: actionLabel,
    ...(input.hasCartAction ? { secondaryActionLabel: requiresBooking ? 'Book now' : 'Buy now' } : {}),
  };
}

export function selectFullOutletMenu<T extends { id: string; name: string }>(products: T[], featuredIds: string[]) {
  const featured = new Set(featuredIds);
  const sorted = orderProductCatalogue(products);
  return [...sorted.filter((product) => featured.has(product.id)), ...sorted.filter((product) => !featured.has(product.id))]
    .map((product) => ({ ...product, featured: featured.has(product.id) }));
}

export function selectPublicOutletProductIds(featuredIds: string[], sellableIds: string[]) {
  const sellable = new Set(sellableIds);
  const selected = featuredIds.filter((id) => sellable.has(id));
  return selected.length > 0 ? selected : sellableIds;
}

export function selectPublicOutletPreviewProducts<T extends {
  status?: string | null;
  review_status?: string | null;
}>(products: readonly T[]): T[] {
  return products.filter((product) => product.status === 'active' && product.review_status === 'approved');
}

export function getPublicOutletEmptyState(kind: 'products' | 'gallery'): PublicOutletEmptyState {
  if (kind === 'gallery') {
    return {
      title: 'Photos coming soon',
      body: 'The outlet team is preparing a closer look at this place.',
    };
  }

  return {
    title: 'Experiences coming soon',
    body: 'This outlet is preparing its bookable experiences. Check back soon for local favourites.',
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function validDay(value?: string) {
  return value && ISO_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value ? value : null;
}

/** Returns the number of nights between valid Malaysia calendar dates, or null for an invalid range. */
export function getStayNightCount(checkIn: string, checkOut: string): number | null {
  const validCheckIn = validDay(checkIn);
  const validCheckOut = validDay(checkOut);
  if (!validCheckIn || !validCheckOut || validCheckOut <= validCheckIn) return null;
  return Math.round((Date.parse(`${validCheckOut}T00:00:00Z`) - Date.parse(`${validCheckIn}T00:00:00Z`)) / 86_400_000);
}

/** The existing stay search normalizes reservations to at most 30 nights. */
export const MAX_STAY_NIGHTS = 30;

/** Returns how many whole rooms are needed to fit the selected adults. */
export function getMinimumRoomCount(adults: number, maxGuestsPerRoom: number): number {
  return Math.ceil(adults / maxGuestsPerRoom);
}

/** Normalises the hotel page search params; `today` is the Malaysia calendar date. */
export function resolveStaySearch(p: { checkin?: string; checkout?: string; rooms?: string; adults?: string }, today: string) {
  const checkIn = validDay(p.checkin) && p.checkin! >= today ? p.checkin! : today;
  const out = validDay(p.checkout);
  const diff = out ? Math.round((Date.parse(`${out}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000) : 1;
  const nights = Math.min(Math.max(diff, 1), MAX_STAY_NIGHTS);
  const int = (v: string | undefined, min: number, max: number) => Math.min(Math.max(Number.parseInt(v ?? "", 10) || min, min), max);
  return { checkIn, checkOut: addDays(checkIn, nights), nights, rooms: int(p.rooms, 1, 10), adults: int(p.adults, 1, 20) };
}

/** One night's slot: 15:00 Malaysia time on that date. */
export function stayNightStartsAt(day: string) {
  return new Date(`${day}T15:00:00+08:00`).toISOString();
}
