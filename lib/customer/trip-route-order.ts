export interface RouteOrderStop {
  id: string;
  lat: number;
  lng: number;
  scheduledTime?: string | null;
  isDayOrigin?: boolean;
  isExisting?: boolean;
}

export interface RouteOrderResult {
  ids: string[];
  basis: "matrix" | "approximate";
}

function validMatrix(matrix: number[][] | undefined, count: number): matrix is number[][] {
  return matrix?.length === count && matrix.every((row) => row.length === count
    && row.every((duration) => Number.isFinite(duration) && duration >= 0));
}

function distanceMeters(a: RouteOrderStop, b: RouteOrderStop): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const term = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
}

/** Order one day only. Fixed-time stops retain chronological order; the day origin stays first. */
export function orderTripStops(stops: RouteOrderStop[], matrix?: number[][]): RouteOrderResult {
  if (stops.length <= 1) return { ids: stops.map(({ id }) => id), basis: validMatrix(matrix, stops.length) ? "matrix" : "approximate" };

  const useMatrix = validMatrix(matrix, stops.length);
  const cost = (from: number, to: number) => useMatrix
    ? matrix[from][to]
    : distanceMeters(stops[from], stops[to]);
  const originIndex = stops.findIndex((stop) => stop.isDayOrigin);
  const existingIndices = stops.map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => stop.isExisting)
    .map(({ index }) => index);
  if (existingIndices.length > 0) {
    const ordered = [...existingIndices];
    const flexible = stops.map((_, index) => index).filter((index) => !stops[index].isExisting);
    for (const candidate of flexible) {
      let bestPosition = ordered.length;
      let bestDelta = Number.POSITIVE_INFINITY;
      const firstInsertPosition = stops[ordered[0]]?.isDayOrigin ? 1 : 0;
      for (let position = firstInsertPosition; position <= ordered.length; position += 1) {
        const previous = ordered[position - 1];
        const next = ordered[position];
        if (previous !== undefined && next !== undefined
          && stops[previous].isExisting && stops[next].isExisting
          && stops[previous].scheduledTime && stops[next].scheduledTime) continue;
        const delta = previous === undefined
          ? cost(candidate, next)
          : cost(previous, candidate) + (next === undefined ? 0 : cost(candidate, next) - cost(previous, next));
        if (delta < bestDelta) {
          bestDelta = delta;
          bestPosition = position;
        }
      }
      ordered.splice(bestPosition, 0, candidate);
    }
    return { ids: ordered.map((index) => stops[index].id), basis: useMatrix ? "matrix" : "approximate" };
  }

  const firstTimedIndex = stops.map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => Boolean(stop.scheduledTime))
    .sort((a, b) => a.stop.scheduledTime!.localeCompare(b.stop.scheduledTime!) || a.index - b.index)[0]?.index;
  const start = originIndex >= 0 ? originIndex : firstTimedIndex ?? 0;
  const fixedIndices = stops.map((stop, index) => ({ stop, index }))
    .filter(({ stop, index }) => index !== start && Boolean(stop.scheduledTime))
    .sort((a, b) => a.stop.scheduledTime!.localeCompare(b.stop.scheduledTime!) || a.index - b.index)
    .map(({ index }) => index);
  const ordered = [start, ...fixedIndices];
  const flexible = stops.map((_, index) => index).filter((index) => !ordered.includes(index));

  // Cheapest insertion is deterministic and preserves all fixed-time anchors' chronological order.
  for (const candidate of flexible) {
    let bestPosition = ordered.length;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let position = 1; position <= ordered.length; position += 1) {
      const previous = ordered[position - 1];
      const next = ordered[position];
      const delta = cost(previous, candidate) + (next === undefined ? 0 : cost(candidate, next) - cost(previous, next));
      if (delta < bestDelta) {
        bestDelta = delta;
        bestPosition = position;
      }
    }
    ordered.splice(bestPosition, 0, candidate);
  }

  return { ids: ordered.map((index) => stops[index].id), basis: useMatrix ? "matrix" : "approximate" };
}
