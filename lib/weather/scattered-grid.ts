export type WeatherGridCoordinate = { latitude: number; longitude: number };
export type WeatherGridTriangle = readonly [number, number, number];

type Point = { x: number; y: number; sampleIndex: number };
type Triangle = WeatherGridTriangle;

function circumcircleContains(a: Point, b: Point, c: Point, point: Point) {
  const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(denominator) < 1e-12) return false;
  const aLength = a.x * a.x + a.y * a.y;
  const bLength = b.x * b.x + b.y * b.y;
  const cLength = c.x * c.x + c.y * c.y;
  const centerX = (aLength * (b.y - c.y) + bLength * (c.y - a.y) + cLength * (a.y - b.y)) / denominator;
  const centerY = (aLength * (c.x - b.x) + bLength * (a.x - c.x) + cLength * (b.x - a.x)) / denominator;
  const radiusSquared = (a.x - centerX) ** 2 + (a.y - centerY) ** 2;
  const pointDistanceSquared = (point.x - centerX) ** 2 + (point.y - centerY) ** 2;
  return pointDistanceSquared <= radiusSquared + 1e-12;
}

function triangulate(points: Point[]): Triangle[] {
  if (points.length < 3) return [];
  const minX = Math.min(...points.map(({ x }) => x));
  const maxX = Math.max(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const maxY = Math.max(...points.map(({ y }) => y));
  const span = Math.max(maxX - minX, maxY - minY);
  if (span <= 1e-12) return [];

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const expanded = [...points,
    { x: centerX - 32 * span, y: centerY - 16 * span, sampleIndex: -1 },
    { x: centerX, y: centerY + 32 * span, sampleIndex: -1 },
    { x: centerX + 32 * span, y: centerY - 16 * span, sampleIndex: -1 },
  ];
  const last = expanded.length - 1;
  let triangles: Triangle[] = [[last - 2, last - 1, last]];

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = expanded[pointIndex];
    const badTriangles = triangles.filter(([a, b, c]) => circumcircleContains(
      expanded[a], expanded[b], expanded[c], point,
    ));
    const boundaryEdges = new Map<string, { from: number; to: number; count: number }>();
    for (const triangle of badTriangles) {
      for (const [from, to] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]] as const) {
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        const edge = boundaryEdges.get(key);
        if (edge) edge.count += 1;
        else boundaryEdges.set(key, { from, to, count: 1 });
      }
    }
    const removed = new Set(badTriangles);
    triangles = triangles.filter((triangle) => !removed.has(triangle));
    for (const edge of boundaryEdges.values()) {
      if (edge.count === 1) triangles.push([edge.from, edge.to, pointIndex]);
    }
  }

  return triangles
    .filter(([a, b, c]) => a < points.length && b < points.length && c < points.length);
}

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function convexHull(points: Point[]) {
  const sorted = points.map((point, index) => ({ ...point, sampleIndex: index }))
    .sort((first, second) => first.x - second.x || first.y - second.y);
  if (sorted.length <= 2) return sorted.map(({ sampleIndex }) => sampleIndex);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 1e-12) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 1e-12) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map(({ sampleIndex }) => sampleIndex);
}

function projectedSamples<T extends WeatherGridCoordinate>(samples: T[]) {
  // Open-Meteo returns staggered model-cell centers, so interpolate in local
  // distance-scaled coordinates instead of fabricating a lat/lon rectangle.
  const meanLatitude = samples.reduce((total, sample) => total + sample.latitude, 0) / Math.max(1, samples.length);
  const longitudeScale = Math.max(0.01, Math.cos((meanLatitude * Math.PI) / 180));
  const centerLatitude = meanLatitude;
  const centerLongitude = samples.reduce((total, sample) => total + sample.longitude, 0) / Math.max(1, samples.length);
  const points = samples.map((sample, sampleIndex) => ({
    x: (sample.longitude - centerLongitude) * longitudeScale,
    y: sample.latitude - centerLatitude,
    sampleIndex,
  }));
  return { points, longitudeScale, centerLatitude, centerLongitude };
}

export function buildScatteredWeatherGrid<T extends WeatherGridCoordinate>(samples: T[]) {
  const { points, longitudeScale, centerLatitude, centerLongitude } = projectedSamples(samples);
  const triangles = triangulate(points);
  const hull = convexHull(points);

  const interpolate = (latitude: number, longitude: number, valueFor: (sample: T) => number | null): number | null => {
    const query = { x: (longitude - centerLongitude) * longitudeScale, y: latitude - centerLatitude, sampleIndex: -1 };
    for (const [aIndex, bIndex, cIndex] of triangles) {
      const a = points[aIndex];
      const b = points[bIndex];
      const c = points[cIndex];
      const denominator = cross(a, b, c);
      if (Math.abs(denominator) < 1e-12) continue;
      const weightA = cross(query, b, c) / denominator;
      const weightB = cross(a, query, c) / denominator;
      const weightC = 1 - weightA - weightB;
      if (weightA < -1e-9 || weightB < -1e-9 || weightC < -1e-9) continue;
      const values = [valueFor(samples[aIndex]), valueFor(samples[bIndex]), valueFor(samples[cIndex])];
      if (values.some((value) => value === null || !Number.isFinite(value))) return null;
      return weightA * values[0]! + weightB * values[1]! + weightC * values[2]!;
    }
    return null;
  };

  return { points, triangles, hull, interpolate };
}

export function distanceToWeatherGridBoundary(grid: ReturnType<typeof buildScatteredWeatherGrid>, pointIndex: number) {
  const point = grid.points[pointIndex];
  if (!point || grid.hull.length < 3) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < grid.hull.length; index += 1) {
    const start = grid.points[grid.hull[index]];
    const end = grid.points[grid.hull[(index + 1) % grid.hull.length]];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const denominator = deltaX * deltaX + deltaY * deltaY;
    const projection = denominator === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / denominator,
    ));
    minimum = Math.min(minimum, Math.hypot(
      point.x - (start.x + projection * deltaX),
      point.y - (start.y + projection * deltaY),
    ));
  }
  return minimum;
}

export function nearestWeatherCellSpacing(grid: ReturnType<typeof buildScatteredWeatherGrid>) {
  const nearestDistances = grid.points.map((point, pointIndex) => {
    let minimum = Number.POSITIVE_INFINITY;
    grid.points.forEach((candidate, candidateIndex) => {
      if (candidateIndex !== pointIndex) minimum = Math.min(minimum, Math.hypot(point.x - candidate.x, point.y - candidate.y));
    });
    return minimum;
  }).filter(Number.isFinite).sort((first, second) => first - second);
  return nearestDistances.length ? nearestDistances[Math.floor(nearestDistances.length / 2)] : 0;
}

export function maximumWeatherGridTriangleEdge(grid: ReturnType<typeof buildScatteredWeatherGrid>) {
  return grid.triangles.reduce((maximum, [firstIndex, secondIndex, thirdIndex]) => {
    const first = grid.points[firstIndex];
    const second = grid.points[secondIndex];
    const third = grid.points[thirdIndex];
    return Math.max(maximum,
      Math.hypot(first.x - second.x, first.y - second.y),
      Math.hypot(second.x - third.x, second.y - third.y),
      Math.hypot(third.x - first.x, third.y - first.y),
    );
  }, 0);
}
