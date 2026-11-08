// Layout math for the Explore postcard board (components/customer/explore-postcard-board.tsx).
// Board units are px of the unscaled 1100×680 board; the component scales it to fit.

type Point = { x: number; y: number };

export const BOARD = { width: 1100, height: 680, card: { w: 150, h: 100 }, map: { x: 200, y: 150, w: 700, h: 376 } } as const;

const COLUMNS = [30, 205, 380, 555, 730, 905];
/** Top-left corners of the 16 postcard slots: 6 along the top, 6 along the bottom, 2 down each side. */
export const SLOTS: readonly Point[] = [
  ...COLUMNS.map((x) => ({ x, y: 22 })),
  ...COLUMNS.map((x) => ({ x, y: 560 })),
  { x: 30, y: 210 }, { x: 30, y: 385 },
  { x: 920, y: 210 }, { x: 920, y: 385 },
];

/** The state map's viewBox (0 100 1600 860, preserveAspectRatio none) scaled into the board's map box. */
const MAP_SCALE = BOARD.map.w / 1600;
export function toBoardPoint(point: Point): Point {
  return { x: BOARD.map.x + point.x * MAP_SCALE, y: BOARD.map.y + (point.y - 100) * MAP_SCALE };
}

/**
 * Matches anchors (board coordinates) to slots so strings rarely cross: slots are
 * ordered by angle around the board centre, anchors by angle around their own
 * centroid (x squashed, the map is wide), then every rotation of that pairing is
 * tried and the shortest total string length wins. Returns anchor id → slot index.
 */
export function assignPostcardSlots(anchors: { id: string; x: number; y: number }[]): Record<string, number> {
  const S = SLOTS.length, n = anchors.length;
  if (n > S) throw new Error(`postcard board has ${S} slots, got ${n} anchors`);
  if (n === 0) return {};
  const centre = (slot: Point) => ({ x: slot.x + BOARD.card.w / 2, y: slot.y + BOARD.card.h / 2 });
  const slotOrder = SLOTS.map((slot, index) => ({ index, angle: Math.atan2(centre(slot).y - BOARD.height / 2, centre(slot).x - BOARD.width / 2) }))
    .sort((a, b) => a.angle - b.angle).map((slot) => slot.index);
  const cx = anchors.reduce((sum, a) => sum + a.x, 0) / n, cy = anchors.reduce((sum, a) => sum + a.y, 0) / n;
  const anchorOrder = [...anchors].sort((a, b) => Math.atan2(a.y - cy, (a.x - cx) * 0.55) - Math.atan2(b.y - cy, (b.x - cx) * 0.55));
  const slotFor = (j: number, r: number) => slotOrder[(Math.round((j * S) / n) + r) % S];
  let best = 0, bestDistance = Infinity;
  for (let r = 0; r < S; r++) {
    const distance = anchorOrder.reduce((sum, anchor, j) => {
      const c = centre(SLOTS[slotFor(j, r)]);
      return sum + Math.hypot(c.x - anchor.x, c.y - anchor.y);
    }, 0);
    if (distance < bestDistance) { bestDistance = distance; best = r; }
  }
  return Object.fromEntries(anchorOrder.map((anchor, j) => [anchor.id, slotFor(j, best)]));
}

/** A string from a postcard's pin to its state, sagging 40px below the lower end. */
export function stringPath(from: Point, to: Point): string {
  return `M${from.x},${from.y} Q${(from.x + to.x) / 2},${Math.max(from.y, to.y) + 40} ${to.x},${to.y}`;
}
