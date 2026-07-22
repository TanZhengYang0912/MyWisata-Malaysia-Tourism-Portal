import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityCentre, parseRecommendationCoordinates } from '@/lib/personalization/location';

describe('parseRecommendationCoordinates', () => {
  it('accepts valid browser coordinates', () => {
    expect(parseRecommendationCoordinates({ latitude: 3.139, longitude: 101.6869 })).toEqual({ lat: 3.139, lng: 101.6869 });
  });

  it('rejects invalid or incomplete coordinate input', () => {
    expect(parseRecommendationCoordinates({ latitude: 91, longitude: 101 })).toBeNull();
    expect(parseRecommendationCoordinates({ latitude: 3 })).toBeNull();
    expect(parseRecommendationCoordinates(null)).toBeNull();
  });

  it('geocodes a profile city that is outside the small built-in fallback list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ lat: '6.1248', lon: '100.3678' }]), { status: 200 })));

    await expect(cityCentre('Alor Setar')).resolves.toEqual({ lat: 6.1248, lng: 100.3678 });
  });

  afterEach(() => vi.unstubAllGlobals());
});
