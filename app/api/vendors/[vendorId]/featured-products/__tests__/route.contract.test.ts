import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const routeSource = readFileSync(resolve(root, 'app/api/vendors/[vendorId]/featured-products/route.ts'), 'utf8');
const pageSource = readFileSync(resolve(root, 'app/vendor/products/page.tsx'), 'utf8');

describe('Vendor owner featured products contracts', () => {
  it('enforces owner-only permission for updating featured products', () => {
    expect(routeSource).toContain('access.access.isOwner');
    expect(routeSource).toContain('Only the vendor owner can select featured products');
  });

  it('enforces a maximum of 4 featured products boundary', () => {
    expect(routeSource).toContain('productIds.length > 4');
    expect(routeSource).toContain('You can select a maximum of 4 featured products');
    expect(pageSource).toContain('featuredIds.length >= 4');
    expect(pageSource).toContain('ui.products.featuredLimitReached');
  });

  it('synchronizes featured tags in products table for backward compatibility', () => {
    expect(routeSource).toContain("contains('tags', ['featured'])");
    expect(routeSource).toContain("update({ tags:");
  });

  it('renders multi-outlet coverage badge and reviews in vendor products page', () => {
    expect(pageSource).toContain('ui.products.allOutletsAvailable');
    expect(pageSource).toContain('ui.products.multiOutletAvailable');
    expect(pageSource).toContain('product.rating');
    expect(pageSource).toContain('product.reviews');
    expect(pageSource).toContain('toggleFeatured');
  });

  it('supports sorting by rating, reviews, outlets and price in vendor products page', () => {
    expect(pageSource).toContain('ui.products.sortHighestRated');
    expect(pageSource).toContain('ui.products.sortMostReviews');
    expect(pageSource).toContain('ui.products.sortMostOutlets');
    expect(pageSource).toContain('ui.products.sortPriceHigh');
  });
});
