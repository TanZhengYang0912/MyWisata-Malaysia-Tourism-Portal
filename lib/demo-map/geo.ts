export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface GeoBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export function projectPoint(
  point: [number, number],
  bounds: GeoBounds,
  canvas: { width: number; height: number; padding: number },
): ProjectedPoint {
  const usableWidth = canvas.width - canvas.padding * 2;
  const usableHeight = canvas.height - canvas.padding * 2;
  const x = canvas.padding + ((point[0] - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * usableWidth;
  const y = canvas.height - canvas.padding - ((point[1] - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * usableHeight;
  return { x, y };
}

function ringToPath(ring: number[][], bounds: GeoBounds, canvas: { width: number; height: number; padding: number }): string {
  return ring.map((point, index) => {
    const projected = projectPoint([point[0], point[1]], bounds, canvas);
    return `${index === 0 ? "M" : "L"}${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
  }).join(" ") + " Z";
}

export function featureToPath(
  geometry: GeoJsonGeometry,
  bounds: GeoBounds,
  canvas: { width: number; height: number; padding: number },
): string {
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  return rings.map((ring) => ringToPath(ring, bounds, canvas)).join(" ");
}

export function geometryBounds(geometries: GeoJsonGeometry[]): GeoBounds {
  const points = geometries.flatMap((geometry) => geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2));
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return { minLng: Math.min(...lngs), minLat: Math.min(...lats), maxLng: Math.max(...lngs), maxLat: Math.max(...lats) };
}
