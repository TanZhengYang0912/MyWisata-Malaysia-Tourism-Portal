import { describe, expect, it } from 'vitest';
import { ratingFromRows } from '../rating-summary';

describe('ratingFromRows', () => {
  it('returns null (not a fabricated 0) when there are zero visible reviews', async () => {
    expect(await ratingFromRows([])).toEqual({ rating: null, reviewCount: 0 });
  });

  it('rounds the average to 1 decimal place', async () => {
    const result = await ratingFromRows([{ rating: 5 }, { rating: 4 }, { rating: 4 }]);
    expect(result).toEqual({ rating: 4.3, reviewCount: 3 });
  });

  it('handles a single review', async () => {
    expect(await ratingFromRows([{ rating: 3 }])).toEqual({ rating: 3, reviewCount: 1 });
  });
});
