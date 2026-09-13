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

  it('prioritises vendor-owner selected products when provided', () => {
    const products = [
      { id: 'p1', name: 'Product 1', coverUrl: '1.jpg', soldAt: [{ id: 'o1' }] },
      { id: 'p2', name: 'Product 2', coverUrl: '2.jpg', soldAt: [{ id: 'o1' }] },
      { id: 'p3', name: 'Product 3', coverUrl: '3.jpg', soldAt: [{ id: 'o1' }] },
      { id: 'p4', name: 'Product 4', coverUrl: '4.jpg', soldAt: [{ id: 'o1' }] },
      { id: 'p5', name: 'Product 5', coverUrl: '5.jpg', soldAt: [{ id: 'o1' }] },
    ];

    expect(selectFeaturedVendorProducts(products, 4, ['p3', 'p5', 'p1']).map((p) => p.id)).toEqual(['p3', 'p5', 'p1']);
  });

  it('keeps the vendor page as a fixed storefront information architecture', () => {
    expect(pageSource).toContain("t('ui.vendor.featuredExperiences')");
    expect(pageSource).toContain("t('ui.vendor.findAcrossMalaysia')");
    expect(pageSource).toContain("t('ui.vendor.about')");
    expect(pageSource).toContain("t('ui.vendor.policiesSupport')");
    expect(pageSource).toContain('id="experiences"');
    expect(pageSource).toContain('id="locations"');
    expect(pageSource).toContain('selectFeaturedVendorProducts(catalogue, 4, explicitFeaturedIds)');
    expect(pageSource).not.toContain('id="all-products-heading"');
  });

  it('routes vendor shares back to the vendor storefront', () => {
    const shareSource = readFileSync(join(process.cwd(), 'components/shared/share-button.tsx'), 'utf8');
    expect(shareSource).toContain("vendor: (id) => `/customer/vendor/${id}`");
  });
});
