import { describe, expect, it } from 'vitest';
import { orderProductCatalogue, toVendorCatalogueCard } from '@/lib/customer/product-catalogue';

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
