import { describe, expect, it } from 'vitest';
import {
  buildProductFormDefaults,
  normalizeProductTags,
  validateProductReviewReadiness,
} from '../product-form-helpers';

describe('buildProductFormDefaults', () => {
  it('keeps edit-only metadata outside the strict form values', () => {
    const defaults = buildProductFormDefaults({
      id: 'product-1',
      outletId: 'outlet-1',
      name: 'Rainforest Canopy Trek',
      productType: 'experience',
      requiresBooking: true,
      basePrice: 128,
      tags: ['nature'],
      submissionMode: 'review',
    });

    expect(defaults).not.toHaveProperty('id');
    expect(defaults).not.toHaveProperty('outletId');
    expect(defaults.tags).toBe('nature');
    expect(defaults.submissionMode).toBe('review');
  });
});

describe('normalizeProductTags', () => {
  it('converts comma-separated form input into trimmed unique tags', () => {
    expect(normalizeProductTags(' Malaysia, batik, Malaysia,  local art ')).toEqual([
      'Malaysia',
      'batik',
      'local art',
    ]);
  });

  it('accepts an existing array and drops empty values', () => {
    expect(normalizeProductTags(['food', '', ' heritage ', 'food'])).toEqual(['food', 'heritage']);
  });

  it('limits the result to the catalogue maximum', () => {
    expect(normalizeProductTags(Array.from({ length: 22 }, (_, index) => `tag-${index}`))).toHaveLength(20);
  });
});

describe('validateProductReviewReadiness', () => {
  it('requires a cover image before review submission', () => {
    expect(validateProductReviewReadiness({ productType: 'product', coverUrl: '', availableStock: 10 })).toEqual({
      coverUrl: 'Add a cover image before submitting for review.',
    });
  });

  it('requires stock for stock-backed products', () => {
    expect(validateProductReviewReadiness({ productType: 'food', coverUrl: 'https://example.com/food.jpg', availableStock: 0 })).toEqual({
      availableStock: 'Add stock before submitting this product for review.',
    });
  });

  it('allows digital products when a download asset is ready', () => {
    expect(validateProductReviewReadiness({ productType: 'digital', coverUrl: 'https://example.com/guide.jpg', digitalAssetUrl: 'https://example.com/guide.pdf' })).toEqual({});
  });
});
