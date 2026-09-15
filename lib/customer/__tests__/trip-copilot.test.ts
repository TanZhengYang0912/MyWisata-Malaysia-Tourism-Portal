import { describe, expect, it, vi } from 'vitest';
import type { ComputedActivity } from '@/backend/core/types';

const mocks = vi.hoisted(() => ({ searchActivities: vi.fn() }));
vi.mock('@/backend/domains/catalogue', () => ({ searchActivities: mocks.searchActivities }));

const { getTripCopilotCandidates } = await import('../trip-copilot');

function activity(overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id: 'p1',
    outletId: 'o1',
    name: 'Penang Hill Funicular',
    category: 'Nature',
    categorySlug: 'activity',
    description: 'Ride to the summit.',
    image: 'https://example.com/hill.jpg',
    price: 30,
    rating: 4.6,
    reviews: 120,
    duration: '2h',
    requiresBooking: true,
    variants: [],
    isHiddenGem: false,
    outlet: { id: 'o1', vendorId: 'v1', name: 'Penang Hill', category: 'activity', state: 'Penang', city: 'George Town', address: '', lat: 5.4141, lng: 100.3288 } as ComputedActivity['outlet'],
    ...overrides,
  } as ComputedActivity;
}

describe('getTripCopilotCandidates', () => {
  it('maps real catalogue listings into candidates, filtered by state and sorted by rating', async () => {
    mocks.searchActivities.mockResolvedValue([activity()]);

    const result = await getTripCopilotCandidates({ state: 'Penang' }, {} as never);

    expect(mocks.searchActivities).toHaveBeenCalledWith({ state: 'Penang', categorySlug: null, sort: 'rating_desc' }, {});
    expect(result).toEqual([{
      productId: 'p1',
      name: 'Penang Hill Funicular',
      category: 'Nature',
      categorySlug: 'activity',
      price: 30,
      rating: 4.6,
      reviews: 120,
      description: 'Ride to the summit.',
      image: 'https://example.com/hill.jpg',
      requiresBooking: true,
      state: 'Penang',
      isHiddenGem: false,
      lat: 5.4141,
      lng: 100.3288,
      weatherSensitivity: 'unknown',
    }]);
  });

  it('prefers the listing\'s own place state and coordinate over its outlet\'s', async () => {
    mocks.searchActivities.mockResolvedValue([activity({ place: { state: 'Langkawi', lat: 6.35, lng: 99.8 } })]);

    const [result] = await getTripCopilotCandidates({}, {} as never);

    expect(result.state).toBe('Langkawi');
    expect(result.lat).toBe(6.35);
    expect(result.lng).toBe(99.8);
  });

  it('classifies real weather sensitivity from the activity\'s own attributes/typeSlugs', async () => {
    mocks.searchActivities.mockResolvedValue([
      activity({ id: 'p-outdoor', attributes: { indoorOutdoor: 'outdoor' } }),
      activity({ id: 'p-indoor', attributes: { indoorOutdoor: 'indoor' } }),
    ]);

    const result = await getTripCopilotCandidates({}, {} as never);

    expect(result.find((c) => c.productId === 'p-outdoor')?.weatherSensitivity).toBe('weather_sensitive');
    expect(result.find((c) => c.productId === 'p-indoor')?.weatherSensitivity).toBe('not_weather_sensitive');
  });

  it('excludes listings already in the trip', async () => {
    mocks.searchActivities.mockResolvedValue([activity({ id: 'p1' }), activity({ id: 'p2', name: 'Other' })]);

    const result = await getTripCopilotCandidates({ excludeProductIds: ['p1'] }, {} as never);

    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe('p2');
  });

  it('caps candidates at 12 even if the catalogue query returns more', async () => {
    mocks.searchActivities.mockResolvedValue(Array.from({ length: 20 }, (_, i) => activity({ id: `p${i}`, name: `Listing ${i}` })));

    const result = await getTripCopilotCandidates({}, {} as never);

    expect(result).toHaveLength(12);
  });

  it('returns an empty list when nothing real matches', async () => {
    mocks.searchActivities.mockResolvedValue([]);

    const result = await getTripCopilotCandidates({ state: 'Sabah' }, {} as never);

    expect(result).toEqual([]);
  });
});
