const MAX_SUGGESTION_DISTANCE_KM = 5;
const EARTH_RADIUS_KM = 6371;

export type PlaceCoordinate = {
  id: string;
  name: string;
  level: string;
  latitude: number;
  longitude: number;
};

export type SuggestedPlace = PlaceCoordinate & { distanceKm: number };

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function distanceKm(
  latitude: number,
  longitude: number,
  place: PlaceCoordinate,
) {
  const latitudeDelta = toRadians(place.latitude - latitude);
  const longitudeDelta = toRadians(place.longitude - longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitude)) * Math.cos(toRadians(place.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function selectSuggestedPlace(
  latitude: number,
  longitude: number,
  places: PlaceCoordinate[],
): SuggestedPlace | null {
  const candidates = places
    .map((place) => ({ ...place, distanceKm: distanceKm(latitude, longitude, place) }))
    .filter((place) => place.distanceKm <= MAX_SUGGESTION_DISTANCE_KM)
    .sort((left, right) => left.distanceKm - right.distanceKm);

  return candidates[0] ?? null;
}
