import { describe, expect, it } from 'vitest';
import { parseRecommendationCoordinates } from '@/lib/personalization/location';

describe('parseRecommendationCoordinates', () => {
  it('accepts valid browser coordinates', () => {
    expect(parseRecommendationCoordinates({ latitude: 3.139, longitude: 101.6869 })).toEqual({ lat: 3.139, lng: 101.6869 });
  });

  it('rejects invalid or incomplete coordinate input', () => {
    expect(parseRecommendationCoordinates({ latitude: 91, longitude: 101 })).toBeNull();
    expect(parseRecommendationCoordinates({ latitude: 3 })).toBeNull();
    expect(parseRecommendationCoordinates(null)).toBeNull();
  });
});
