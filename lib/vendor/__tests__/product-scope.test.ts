import { describe, expect, it } from 'vitest';
import { isRatingEligibleProduct, isVisibleActiveProduct, resolveProductOutlet } from '@/lib/vendor/product-scope';

describe('resolveProductOutlet', () => {
  it('keeps a shared product visible through an outlet offer in scope', () => {
    const result = resolveProductOutlet(
      {
        outlet_id: null,
        outlets: null,
        outlet_offers: [
          { outlet_id: 'outside', status: 'active', outlets: { id: 'outside', name: 'Outside' } },
          { outlet_id: 'assigned', status: 'active', outlets: { id: 'assigned', name: 'Assigned' } },
        ],
      },
      ['assigned'],
    );

    expect(result).toEqual({ id: 'assigned', name: 'Assigned' });
  });

  it('hides a shared product when none of its offers are in scope', () => {
    expect(resolveProductOutlet({ outlet_id: null, outlets: null, outlet_offers: [] }, ['assigned'])).toBeNull();
  });

  it('does not authorize a shared product through an inactive offer', () => {
    expect(resolveProductOutlet({
      outlet_id: null,
      outlets: null,
      outlet_offers: [{ outlet_id: 'assigned', status: 'inactive' }],
    }, ['assigned'])).toBeNull();
  });

  it('counts an active shared product when an assigned outlet has an active offer', () => {
    expect(isVisibleActiveProduct({
      status: 'active',
      outlet_id: null,
      outlets: null,
      outlet_offers: [{ outlet_id: 'assigned', status: 'active' }],
    }, ['assigned'])).toBe(true);
  });

  it('allows rated food listings to appear in the vendor ranking', () => {
    expect(isRatingEligibleProduct({
      status: 'active',
      outlet_id: null,
      outlets: null,
      outlet_offers: [{ outlet_id: 'assigned', status: 'active' }],
    }, ['assigned'])).toBe(true);
  });
});
