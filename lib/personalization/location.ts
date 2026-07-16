export type Coordinates = { lat: number; lng: number };

const MALAYSIA_CITY_CENTRES: Record<string, Coordinates> = {
  'kuala lumpur': { lat: 3.139, lng: 101.6869 },
  'george town': { lat: 5.4141, lng: 100.3288 },
  penang: { lat: 5.4141, lng: 100.3288 },
  johor: { lat: 1.4927, lng: 103.7414 },
  'johor bahru': { lat: 1.4927, lng: 103.7414 },
  ipoh: { lat: 4.5975, lng: 101.0901 },
  melaka: { lat: 2.1896, lng: 102.2501 },
  'kota kinabalu': { lat: 5.9804, lng: 116.0735 },
  kuching: { lat: 1.5533, lng: 110.3592 },
  putrajaya: { lat: 2.9264, lng: 101.6964 },
};

export function parseRecommendationCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== 'object') return null;
  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { lat: latitude, lng: longitude };
}

/** Profile city is never stored as device location; this is a coarse fallback only. */
export function cityCentre(city: string | null | undefined): Coordinates | null {
  if (!city) return null;
  return MALAYSIA_CITY_CENTRES[city.trim().toLowerCase()] ?? null;
}
