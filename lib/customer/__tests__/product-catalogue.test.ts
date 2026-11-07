import { describe, expect, it } from 'vitest';
import type { ComputedActivity } from '@/backend/core/types';
import { isMerchantFeatured, orderProductCatalogue, toDiscoveryCatalogueCard, toOutletCatalogueCard, toVendorCatalogueCard } from '@/lib/customer/product-catalogue';

describe('ordinary product ordering', () => {
  it('orders names naturally with deterministic id ties without mutating input', () => {
    const items = [{ id: 'b', name: 'Tea 10' }, { id: 'z', name: 'tea 2' }, { id: 'a', name: 'Tea 2' }];
    expect(orderProductCatalogue(items).map((item) => item.id)).toEqual(['a', 'z', 'b']);
    expect(items.map((item) => item.id)).toEqual(['b', 'z', 'a']);
  });

  it('deduplicates products and featured ids, ignoring unavailable selections', () => {
    const items = [{ id: 'b', name: 'Tea 10' }, { id: 'a', name: 'Tea 2' }, { id: 'a', name: 'Duplicate' }];
    expect(orderProductCatalogue(items, ['b', 'b', 'missing']).map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('merchant featured tag', () => {
  it('only treats the exact featured tag as a merchant star', () => {
    expect(isMerchantFeatured({ tags: ['featured'] })).toBe(true);
    for (const tags of [['Featured'], [], undefined, null]) expect(isMerchantFeatured({ tags })).toBe(false);
  });
});

describe('catalogue card adapter', () => {
  it('summarizes distinct eligible outlet prices and retains review data', () => {
    const outlet = { name: 'Outlet', city: 'Ipoh', state: 'Perak', operatingHours: null };
    const result = toVendorCatalogueCard({ id: 'p', vendorId: 'v', name: 'Tea', description: null, productType: 'food', imageUrl: null, fromPrice: 99, requiresBooking: false, rating: 4.5, reviews: 12, soldAt: [
      { ...outlet, id: 'a', price: 5 }, { ...outlet, id: 'b', price: 0 }, { ...outlet, id: 'b', price: 3 },
    ] });
    expect(result.sales).toEqual({ outletCount: 2, fromPrice: 0 });
    expect(result.reviews).toBe(12);
    expect(result.singleOutlet).toBeUndefined();
  });
});

describe('home discovery card adapter', () => {
  const activity = (salesSummary: ComputedActivity['salesSummary'], verified = true) => ({
    id: 'p', vendorId: 'v', name: 'Tea', description: null, categorySlug: 'food', image: null, requiresBooking: false,
    rating: 4, reviews: 3, price: 9, salesSummary,
    outlet: { id: 'o1', vendorId: 'v', city: 'Ipoh', state: 'Perak', operatingHours: null, verified },
  }) as unknown as ComputedActivity;

  it('uses the product-level summary, not the representative outlet, for several outlets', () => {
    const card = toDiscoveryCatalogueCard(activity({ outletCount: 4, fromPrice: 3 }));
    expect(card.sales).toEqual({ outletCount: 4, fromPrice: 3 });
    expect(card.singleOutlet).toBeUndefined();
  });

  it("keeps a single verified outlet's place and hours, but never an unverified one's", () => {
    expect(toDiscoveryCatalogueCard(activity({ outletCount: 1, fromPrice: 9 })).singleOutlet).toEqual({ id: 'o1', city: 'Ipoh', state: 'Perak', operatingHours: null });
    expect(toDiscoveryCatalogueCard(activity({ outletCount: 1, fromPrice: 9 }, false)).singleOutlet).toBeUndefined();
  });

  it('marks paid and merchant-featured products, and pins the open outlet only under Open now', () => {
    const plain = toDiscoveryCatalogueCard(activity({ outletCount: 4, fromPrice: 3 }));
    expect(plain).not.toHaveProperty('sponsored', true);
    expect(plain.featured).toBe(false);
    expect(plain.pinnedOutletId).toBeUndefined();
    const both = toDiscoveryCatalogueCard(Object.assign(activity({ outletCount: 2, fromPrice: 11.9 }), {
      tags: ['featured'], sponsorship: { placementId: 'pl1', label: 'Sponsored' as const },
      openNowSummary: { totalOutletCount: 4, openOutletCount: 2 },
    }));
    expect(both.sponsored).toBe(true);
    expect(both.featured).toBe(true);
    expect(both.openNowSummary).toEqual({ totalOutletCount: 4, openOutletCount: 2 });
    expect(both.pinnedOutletId).toBe('o1');
  });

  it('never labels vendor-page cards', () => {
    const card = toVendorCatalogueCard({ id: 'p', vendorId: 'v', name: 'Tea', description: null, productType: 'food', imageUrl: null, fromPrice: 1, requiresBooking: false, rating: 0, reviews: 0, soldAt: [] });
    expect(card.sponsored).toBeUndefined();
    expect(card.featured).toBeUndefined();
  });
});

describe('outlet offer card adapter', () => {
  const offer = Object.assign({
    id: 'p', vendorId: 'v', name: 'Briyani', description: null, categorySlug: 'food', image: null, requiresBooking: false,
    rating: 4, reviews: 3, price: 8.48, tags: ['featured'], salesSummary: { outletCount: 4, fromPrice: 6 },
    openNowSummary: { totalOutletCount: 4, openOutletCount: 2 },
    outlet: { id: 'o-annexe', name: 'Hameediyah — Campbell Annexe', vendorId: 'v', city: 'George Town', state: 'Penang', operatingHours: null, verified: true },
  }, { sponsorship: { placementId: 'pl' } }) as unknown as ComputedActivity;

  it("presents one outlet's exact offer with no labels", () => {
    const card = toOutletCatalogueCard(offer);
    expect(card.sales).toEqual({ outletCount: 1, fromPrice: 8.48 });
    expect(card.pinnedOutletId).toBe('o-annexe');
    expect(card.pinnedOutletName).toBe('Hameediyah — Campbell Annexe');
    expect(card.sponsored).toBe(false);
    expect(card.featured).toBe(false);
    expect(card.openNowSummary).toBeUndefined();
  });

  it('can drop the discovery labels from a discovery card', () => {
    const card = toDiscoveryCatalogueCard(offer, { labels: false });
    expect(card.sponsored).toBe(false);
    expect(card.featured).toBe(false);
    expect(card.sales).toEqual({ outletCount: 4, fromPrice: 6 });
    expect(toDiscoveryCatalogueCard(offer).featured).toBe(true);
  });
});
