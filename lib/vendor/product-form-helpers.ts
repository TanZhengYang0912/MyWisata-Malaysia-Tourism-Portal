import type { ProductCreate } from '@/lib/validation/vendor-schemas';

export const PRODUCT_TAG_LIMIT = 20;

export function buildProductFormDefaults(initialData?: ProductCreate & { id?: string }) {
  if (!initialData) {
    return {
      requiresBooking: false,
      productType: 'product' as const,
      tags: '',
      submissionMode: 'review' as const,
      lowStockThreshold: 5,
    };
  }

  const { id: _id, outletId: _outletId, ...editableFields } = initialData;
  return {
    ...editableFields,
    tags: Array.isArray(initialData.tags) ? initialData.tags.join(', ') : '',
    submissionMode: 'review' as const,
  };
}

export function normalizeProductTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    const tag = String(value).trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag.slice(0, 50));
    if (tags.length === PRODUCT_TAG_LIMIT) break;
  }

  return tags;
}

export type ProductReviewReadinessInput = {
  productType: string;
  coverUrl?: string | null;
  availableStock?: number | null;
  defaultCapacity?: number | null;
  digitalAssetUrl?: string | null;
};

export function validateProductReviewReadiness(input: ProductReviewReadinessInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.coverUrl?.trim()) errors.coverUrl = 'Add a cover image before submitting for review.';

  if (['product', 'food'].includes(input.productType) && (input.availableStock == null || input.availableStock <= 0)) {
    errors.availableStock = 'Add stock before submitting this product for review.';
  }

  if (['activity', 'experience'].includes(input.productType) && (!input.defaultCapacity || input.defaultCapacity <= 0)) {
    errors.defaultCapacity = 'Add a booking capacity before submitting this product for review.';
  }

  if (input.productType === 'digital' && !input.digitalAssetUrl?.trim()) {
    errors.digitalAssetUrl = 'Add a digital download before submitting this product for review.';
  }

  return errors;
}
