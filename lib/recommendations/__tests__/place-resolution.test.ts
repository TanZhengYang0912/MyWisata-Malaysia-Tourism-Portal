import { describe, expect, it } from 'vitest';
import { selectSuggestedPlace } from '@/lib/recommendations/place-resolution';

describe('selectSuggestedPlace', () => {
  const places = [
    { id: 'poi-ipoh', name: 'Ipoh Railway Station', level: 'poi', latitude: 4.5978, longitude: 101.0787 },
    { id: 'poi-penang', name: 'George Town', level: 'poi', latitude: 5.4141, longitude: 100.3288 },
  ];

  it('returns the nearest place only when it is within five kilometres', () => {
    expect(selectSuggestedPlace(4.598, 101.079, places)).toMatchObject({
      id: 'poi-ipoh',
      name: 'Ipoh Railway Station',
    });
  });

  it('does not infer an internal place for an out-of-range location', () => {
    expect(selectSuggestedPlace(3.139, 101.6869, places)).toBeNull();
  });
});
