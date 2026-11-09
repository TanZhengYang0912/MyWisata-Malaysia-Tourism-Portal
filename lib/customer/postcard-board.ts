// Layout math for the Explore postcard board (components/customer/explore-postcard-board.tsx).
// Board units are px of the unscaled 1100×680 board; the component scales it to fit.

type Point = { x: number; y: number };

export const BOARD = { width: 1100, height: 680, card: { w: 150, h: 100 } } as const;

const COLUMNS = [30, 205, 380, 555, 730, 905];
/** Top-left corners of the 16 postcard slots: 6 along the top, 6 along the bottom, 2 down each side. */
export const SLOTS: readonly Point[] = [
  ...COLUMNS.map((x) => ({ x, y: 22 })),
  ...COLUMNS.map((x) => ({ x, y: 560 })),
  { x: 30, y: 210 }, { x: 30, y: 385 },
  { x: 920, y: 210 }, { x: 920, y: 385 },
];

export type BoardRegion = "peninsular" | "borneo";
/**
 * Where each region of the state map sits on the board (approved board sample): the region's map-unit
 * origin is drawn at (x, y) and scaled. Not to real distance — West and East Malaysia are drawn bigger and closer.
 */
export const REGION_PLACEMENT: Record<BoardRegion, { x: number; y: number; scale: number; origin: Point }> = {
  peninsular: { x: 252, y: 168, scale: 0.74, origin: { x: 40, y: 328 } },
  borneo: { x: 548, y: 178, scale: 0.47, origin: { x: 807, y: 279 } },
};

/** A map-unit point (state map projection) on the board. */
export function toBoardPoint(point: Point, region: BoardRegion): Point {
  const { x, y, scale, origin } = REGION_PLACEMENT[region];
  return { x: x + (point.x - origin.x) * scale, y: y + (point.y - origin.y) * scale };
}

/** The same placement as an SVG transform for the region's shapes. */
export function regionTransform(region: BoardRegion): string {
  const { x, y, scale, origin } = REGION_PLACEMENT[region];
  return `translate(${x} ${y}) scale(${scale}) translate(${-origin.x} ${-origin.y})`;
}

/** Where a string leaves a postcard: the pin at the top centre of its slot. */
export const slotPin = (slot: Point): Point => ({ x: slot.x + BOARD.card.w / 2, y: slot.y + 2 });

function crosses(p1: Point, p2: Point, p3: Point, p4: Point) {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0;
}

const assignmentCache = new Map<string, Record<string, number>>();

/**
 * Matches anchors (board coordinates) to slots so no two straight strings cross (approved board sample):
 * pairwise swaps on squared string length from 400 seeded shuffles keep the best start, every crossing pair
 * is then swapped apart, and further squared-length swaps are taken only when they add no crossing.
 * Deterministic (fixed seed, Fisher–Yates) and cached per anchor set. Returns anchor id → slot index.
 */
export function assignPostcardSlots(anchors: { id: string; x: number; y: number }[]): Record<string, number> {
  const S = SLOTS.length, n = anchors.length;
  if (n > S) throw new Error(`postcard board has ${S} slots, got ${n} anchors`);
  if (n === 0) return {};
  const key = anchors.map((a) => `${a.id}:${a.x.toFixed(1)},${a.y.toFixed(1)}`).join("|");
  const cached = assignmentCache.get(key);
  if (cached) return cached;

  const pins = SLOTS.map(slotPin);
  const cost = (a: number, slot: number) => (pins[slot].x - anchors[a].x) ** 2 + (pins[slot].y - anchors[a].y) ** 2;
  const swapPays = (assign: number[], i: number, j: number) =>
    cost(i, assign[j]) + cost(j, assign[i]) < cost(i, assign[i]) + cost(j, assign[j]) - 1e-9;
  const swap = (assign: number[], i: number, j: number) => { [assign[i], assign[j]] = [assign[j], assign[i]]; };
  const crossingPair = (assign: number[]) => {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (crosses(pins[assign[i]], anchors[i], pins[assign[j]], anchors[j])) return [i, j] as const;
    }
    return null;
  };

  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let best: number[] = [], bestTotal = Infinity;
  for (let restart = 0; restart < 400; restart++) {
    const assign = Array.from({ length: S }, (_, i) => i);
    for (let i = S - 1; i > 0; i--) swap(assign, i, Math.floor(rand() * (i + 1)));
    assign.length = n;
    for (let improved = true; improved;) {
      improved = false;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (swapPays(assign, i, j)) { swap(assign, i, j); improved = true; }
    }
    const total = assign.reduce((sum, slot, i) => sum + cost(i, slot), 0);
    if (total < bestTotal - 1e-6) { bestTotal = total; best = [...assign]; }
  }
  // Swapping a crossing pair always shortens the straight total, so this ends.
  for (let pair = crossingPair(best); pair; pair = crossingPair(best)) swap(best, pair[0], pair[1]);
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (!swapPays(best, i, j)) continue;
      swap(best, i, j);
      if (crossingPair(best)) swap(best, i, j); else improved = true;
    }
  }
  const result = Object.fromEntries(anchors.map((anchor, i) => [anchor.id, best[i]]));
  assignmentCache.set(key, result);
  return result;
}

/** A string from a postcard's pin to its state, sagging 12px below the lower end. */
export function stringPath(from: Point, to: Point): string {
  return `M${from.x},${from.y} Q${(from.x + to.x) / 2},${Math.max(from.y, to.y) + 12} ${to.x},${to.y}`;
}
