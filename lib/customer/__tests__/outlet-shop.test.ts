import { describe, expect, it } from 'vitest';
import { getPublicOutletEmptyState, selectPublicOutletProductIds } from '@/lib/customer/outlet-shop';

describe('public outlet shop content', () => {
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
});
