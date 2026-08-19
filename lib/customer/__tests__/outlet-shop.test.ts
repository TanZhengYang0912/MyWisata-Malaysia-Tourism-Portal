import { describe, expect, it } from 'vitest';
import {
  buildOutletProductCardModel,
  buildPublicOutletProfile,
  getOutletDetailActionLabel,
  getOutletProductAction,
  getOutletNavigationModel,
  getPublicOutletEmptyState,
  selectPublicOutletProductIds,
} from '@/lib/customer/outlet-shop';

describe('professional outlet product cards', () => {
  it('builds outlet-specific commerce labels for the default card', () => {
    expect(buildOutletProductCardModel({
      outletName: 'Kuah',
      productName: 'Kilim Mangrove Kayak',
      basePrice: 146,
      category: 'Activity',
      requiresBooking: true,
      availableStock: null,
      rating: 4.6,
      reviews: 76,
      hasCartAction: true,
    })).toEqual({
      categoryLabel: 'Activity',
      priceLabel: 'From RM 146.00',
      descriptionFallback: 'A local favourite from Kuah.',
      availabilityLabel: 'Booking required',
      ratingLabel: '4.6 (76)',
      locationLabel: 'Available at Kuah',
      primaryActionLabel: 'Add booking',
      secondaryActionLabel: 'Book now',
    });
  });

  it('directs incomplete cards to details instead of promising checkout', () => {
    const model = buildOutletProductCardModel({
      outletName: 'Kota Bharu',
      productName: 'Local craft set',
      basePrice: 52,
      category: 'Retail',
      requiresBooking: false,
      availableStock: 0,
      rating: 0,
      reviews: 0,
      hasCartAction: false,
    });

    expect(model).toMatchObject({
      availabilityLabel: 'Out of stock',
      primaryActionLabel: 'View details',
    });
    expect(model.secondaryActionLabel).toBeUndefined();
  });
});

describe('outlet navigation context', () => {
  it('identifies the current outlet within a multi-outlet vendor', () => {
    expect(getOutletNavigationModel([
      { id: 'outlet-a', name: 'A' },
      { id: 'outlet-b', name: 'B' },
      { id: 'outlet-c', name: 'C' },
      { id: 'outlet-d', name: 'D' },
    ], 'outlet-c')).toEqual({
      currentPosition: 3,
      total: 4,
      hasMultipleOutlets: true,
    });
  });

  it('does not present a multi-outlet switcher for a single active outlet', () => {
    expect(getOutletNavigationModel([{ id: 'outlet-a', name: 'A' }], 'outlet-a')).toEqual({
      currentPosition: 1,
      total: 1,
      hasMultipleOutlets: false,
    });
  });
});

describe('outlet detail CTA labels', () => {
  it('uses one clear action for each incomplete purchase state', () => {
    expect(getOutletDetailActionLabel('selection_required')).toBe('Choose options');
    expect(getOutletDetailActionLabel('slot_required')).toBe('Choose a time');
    expect(getOutletDetailActionLabel('out_of_stock')).toBe('View details');
  });
});

describe('public outlet shop content', () => {
  it('shows every sellable product when the page has no featured selection', () => {
    expect(selectPublicOutletProductIds([], ['product-a', 'product-b'])).toEqual(['product-a', 'product-b']);
  });

  it('keeps the page selection when it contains sellable products', () => {
    expect(selectPublicOutletProductIds(['product-b', 'missing'], ['product-a', 'product-b'])).toEqual(['product-b']);
  });

  it('provides a useful public state when optional outlet content is empty', () => {
    expect(getPublicOutletEmptyState('products')).toEqual({
      title: 'Experiences coming soon',
      body: 'This outlet is preparing its bookable experiences. Check back soon for local favourites.',
    });
    expect(getPublicOutletEmptyState('gallery')).toEqual({
      title: 'Photos coming soon',
      body: 'The outlet team is preparing a closer look at this place.',
    });
  });

  it('fills missing public outlet profile fields with stable demo-safe defaults', () => {
    expect(buildPublicOutletProfile({
      outletName: 'Explore Outdoors Malaysia — Kuah',
      vendorName: 'Explore Outdoors Malaysia',
      address: null,
      city: 'Kuah',
      state: 'Kedah',
      country: null,
      phone: null,
      email: null,
      operatingHours: null,
    })).toMatchObject({
      address: 'Kuah, Kedah, Malaysia',
      country: 'Malaysia',
      phone: '+60 3-5555 0199',
      email: 'hello+explore-outdoors-malaysia-kuah@demo.local',
      introTitle: 'A local day, made memorable',
    });
  });

  it('allows direct cart actions only when a valid default purchase choice exists', () => {
    expect(getOutletProductAction({ requiresBooking: false, variantId: 'variant-1', availableStock: 4 })).toEqual({
      kind: 'cart',
      variantId: 'variant-1',
    });
    expect(getOutletProductAction({ requiresBooking: true, variantId: 'variant-1', firstAvailableSlotId: 'slot-1' })).toEqual({
      kind: 'cart',
      variantId: 'variant-1',
      slotId: 'slot-1',
    });
    expect(getOutletProductAction({ requiresBooking: true, variantId: 'variant-1' })).toEqual({
      kind: 'details',
      reason: 'slot_required',
    });
    expect(getOutletProductAction({ requiresBooking: false, variantId: null, availableStock: 4 })).toEqual({
      kind: 'details',
      reason: 'selection_required',
    });
  });
});
