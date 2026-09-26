import { formatMYRNumber } from "@/lib/i18n/format";

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

export function selectFullOutletMenu<T extends { id: string }>(products: T[], featuredIds: string[]) {
  const featured = new Set(featuredIds);
  return products
    .map((product) => ({ ...product, featured: featured.has(product.id) }))
    .sort((left, right) => Number(right.featured) - Number(left.featured));
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
