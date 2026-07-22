import { describe, expect, it } from 'vitest';
import { payoutFeeSen } from '../fees';

describe('payoutFeeSen', () => {
  it('uses the provider fee in sen and safely defaults when unavailable', () => {
    expect(payoutFeeSen({ fee: 125 })).toBe(125);
    expect(payoutFeeSen({ fee: null })).toBe(0);
    expect(payoutFeeSen({ fee: -1 })).toBe(0);
  });
});
