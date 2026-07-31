import { describe, expect, it } from 'vitest';
import {
  filterProductsByOutlet,
  sanitizeOutletPageProductSelections,
} from '@/lib/vendor/product-scope';
import { createDefaultOutletPageDocument } from '@/lib/vendor/outlet-page-schema';

describe('outlet product selection scope', () => {
  it('keeps a product offered to the outlet even when its direct outlet differs', () => {
    const products = [
      {
        id: 'shared-product',
        outlet_id: 'other-outlet',
        status: 'active',
        outlet_offers: [{ outlet_id: 'target-outlet', status: 'active' }],
      },
      {
        id: 'inactive-offer',
        outlet_id: 'other-outlet',
        status: 'active',
        outlet_offers: [{ outlet_id: 'target-outlet', status: 'inactive' }],
      },
    ];

    expect(filterProductsByOutlet(products, 'target-outlet').map((product) => product.id)).toEqual([
      'shared-product',
    ]);
  });

  it('removes stale featured and block product ids that cannot be selected anymore', () => {
    const document = createDefaultOutletPageDocument('KLCC');
    document.featuredIds = ['valid-product', 'stale-product'];
    document.blocks = document.blocks.map((block) =>
      block.type === 'product_grid'
        ? { ...block, productIds: ['valid-product', 'stale-product'] }
        : block,
    );

    const sanitized = sanitizeOutletPageProductSelections(document, new Set(['valid-product']));

    expect(sanitized.featuredIds).toEqual(['valid-product']);
    expect(sanitized.blocks.find((block) => block.type === 'product_grid')?.productIds).toEqual([
      'valid-product',
    ]);
  });
});
