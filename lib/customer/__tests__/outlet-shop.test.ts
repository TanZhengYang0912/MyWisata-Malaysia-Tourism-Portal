import { describe, expect, it } from 'vitest';
import {
  buildOutletProductCardModel,
  buildPublicOutletProfile,
  getActiveDefaultOutletVariant,
  getOutletAvailableStock,
  getOutletVariantPrice,
  getOutletDetailActionLabel,
  getOutletProductAction,
  getSelectedOutletStock,
  getOutletNavigationModel,
  getPublicOutletEmptyState,
  selectPublicOutletProductIds,
  selectPublicOutletPreviewProducts,
  relationOne,
} from '@/lib/customer/outlet-shop';

describe('PostgREST relation shape normalization', () => {
  it('reads a many-to-one relation returned as an object or as a singleton array', () => {
    const category = { name: 'Accommodation', slug: 'accommodation' };
    expect(relationOne(category)).toEqual(category);
    expect(relationOne([category])).toEqual(category);
    expect(relationOne(null)).toBeNull();
  });
});

describe('professional outlet product cards', () => {
  it('builds outlet-specific commerce labels for the default card', () => {
    expect(buildOutletProductCardModel({
      outletName: 'Kuah',
      productName: 'Kilim Mangrove Kayak',
      basePrice: 146,
      category: 'Activity',
      requiresBooking: true,
      availableStock: null,
      hasCartAction: true,
    })).toEqual({
      categoryLabel: 'Activity',
      priceLabel: 'From RM146.00',
      descriptionFallback: 'A local favourite from Kuah.',
      availabilityLabel: 'Booking required',
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

describe('outlet-scoped purchase data', () => {
  it('counts only active variant inventory owned by the selected outlet', () => {
    const variants = [
      { id: 'default', is_default: true, is_active: true, inventory: [
        { outlet_id: 'outlet-a', quantity: 0, reserved: 0 },
        { outlet_id: 'outlet-b', quantity: 20, reserved: 2 },
      ] },
      { id: 'inactive', is_default: false, is_active: false, inventory: [
        { outlet_id: 'outlet-a', quantity: 100, reserved: 0 },
      ] },
      { id: 'active-extra', is_default: false, is_active: true, inventory: [
        { outlet_id: 'outlet-a', quantity: 5, reserved: 2 },
      ] },
    ];

    expect(getOutletAvailableStock(variants, 'outlet-a')).toBe(3);
    expect(getOutletAvailableStock(variants, 'outlet-b')).toBe(18);
    expect(getOutletAvailableStock(variants, 'outlet-c')).toBe(0);
  });

  it('selects an active default variant, then falls back to the first active option', () => {
    const variants = [
      { id: 'inactive-default', name: 'Old', is_default: true, is_active: false },
      { id: 'active-default', name: 'Standard', is_default: true, is_active: true },
      { id: 'active-other', name: 'Large', is_default: false, is_active: true },
    ];

    expect(getActiveDefaultOutletVariant(variants)?.id).toBe('active-default');
    expect(getActiveDefaultOutletVariant(variants.slice(0, 1))).toBeNull();
    expect(getActiveDefaultOutletVariant(variants.slice(1).reverse())?.id).toBe('active-default');
  });

  it('chooses a variant with stock at this outlet before preferring the default', () => {
    const variants = [
      { id: 'sold-out-default', name: 'Standard', is_default: true, is_active: true, inventory: [
        { outlet_id: 'outlet-a', quantity: 4, reserved: 4 },
        { outlet_id: 'outlet-b', quantity: 20, reserved: 0 },
      ] },
      { id: 'stocked-extra', name: 'Large', is_default: false, is_active: true, inventory: [
        { outlet_id: 'outlet-a', quantity: 3, reserved: 1 },
      ] },
      { id: 'inactive-stocked', name: 'Old size', is_default: false, is_active: false, inventory: [
        { outlet_id: 'outlet-a', quantity: 10, reserved: 0 },
      ] },
    ];

    expect(getActiveDefaultOutletVariant(variants, 'outlet-a')?.id).toBe('stocked-extra');
    expect(getActiveDefaultOutletVariant(variants, 'outlet-b')?.id).toBe('sold-out-default');
    expect(getActiveDefaultOutletVariant(variants, 'outlet-c')).toBeNull();
    expect(getActiveDefaultOutletVariant(variants)?.id).toBe('sold-out-default');
  });

  it('adds the selected variant price offset to the outlet price using shared rounding', () => {
    expect(getOutletVariantPrice(4.5, 1.255)).toBe(5.76);
    expect(getOutletVariantPrice(4.5, null)).toBe(4.5);
  });

  it('does not borrow a shared product stock value when the selected outlet has no scoped entry', () => {
    const sharedProduct = {
      outletId: 'outlet-a',
      offers: [{ outletId: 'outlet-a' }, { outletId: 'outlet-b' }],
      availableStock: 12,
      stockByOutlet: { 'outlet-a': 0 },
      requiresBooking: false,
    };

    expect(getSelectedOutletStock(sharedProduct, 'outlet-a')).toBe(0);
    expect(getSelectedOutletStock(sharedProduct, 'outlet-b')).toBe(0);
    expect(getSelectedOutletStock(sharedProduct, 'outlet-a')).not.toBe(12);
  });
});

describe('public outlet shop content', () => {
  it('shows only active products approved for public sale in the customer preview', () => {
    const products = [
      { id: 'public', status: 'active', review_status: 'approved' },
      { id: 'archived', status: 'archived', review_status: 'approved' },
      { id: 'inactive', status: 'inactive', review_status: 'approved' },
      { id: 'pending-review', status: 'active', review_status: 'pending_review' },
      { id: 'rejected-review', status: 'active', review_status: 'rejected' },
    ];

    expect(selectPublicOutletPreviewProducts(products).map((product) => product.id)).toEqual(['public']);
  });

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
      kind: 'details',
      reason: 'slot_required',
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
