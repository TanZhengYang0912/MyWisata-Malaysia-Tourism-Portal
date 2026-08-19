import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getVendorProductTypeLabel,
  selectFeaturedVendorProducts,
  summarizeVendorReviews,
} from '@/lib/customer/vendor-page';

const pageSource = readFileSync(join(process.cwd(), 'app/customer/vendor/[vendorId]/page.tsx'), 'utf8');

describe('vendor storefront presentation', () => {
  it('calculates one vendor rating from real product review metrics', () => {
    expect(summarizeVendorReviews([
      { rating: 5, reviews: 2 },
      { rating: 4, reviews: 1 },
    ])).toEqual({ rating: 4.7, reviews: 3 });
    expect(summarizeVendorReviews([])).toEqual({ rating: null, reviews: 0 });
  });

  it('prioritises image-rich, widely available products for the featured row', () => {
    const products = [
      { id: 'plain', name: 'Plain', coverUrl: null, soldAt: [{ id: 'one' }] },
      { id: 'popular', name: 'Popular', coverUrl: 'popular.jpg', soldAt: [{ id: 'one' }, { id: 'two' }] },
      { id: 'pictured', name: 'Pictured', coverUrl: 'pictured.jpg', soldAt: [{ id: 'one' }] },
    ];

    expect(selectFeaturedVendorProducts(products, 2).map((product) => product.id)).toEqual(['popular', 'pictured']);
  });

  it('uses customer-friendly product type labels', () => {
    expect(getVendorProductTypeLabel('experience')).toBe('Experience');
    expect(getVendorProductTypeLabel('food')).toBe('Food & drink');
    expect(getVendorProductTypeLabel('unknown')).toBe('Local favourite');
  });

  it('keeps the vendor page as a fixed storefront information architecture', () => {
    expect(pageSource).toContain('Featured experiences');
    expect(pageSource).toContain('Find us ');
    expect(pageSource).toContain('About the vendor');
    expect(pageSource).toContain('Policies & support');
    expect(pageSource).toContain('id="experiences"');
    expect(pageSource).toContain('id="locations"');
  });

  it('routes vendor shares back to the vendor storefront', () => {
    const shareSource = readFileSync(join(process.cwd(), 'components/shared/share-button.tsx'), 'utf8');
    expect(shareSource).toContain("vendor: (id) => `/customer/vendor/${id}`");
  });
});
