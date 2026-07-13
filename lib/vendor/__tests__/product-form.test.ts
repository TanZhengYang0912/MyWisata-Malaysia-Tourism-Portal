import { describe, expect, it } from 'vitest';
import {
  normalizeProductTags,
  validateProductReviewReadiness,
} from '../product-form-helpers';

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
