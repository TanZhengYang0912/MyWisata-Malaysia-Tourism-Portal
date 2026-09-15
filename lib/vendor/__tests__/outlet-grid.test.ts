import { describe, expect, it } from 'vitest';
import {
  GRID_COLS,
  GRID_MIN_ROWS,
  density,
  firstFreeSlot,
  fits,
  gridRowCount,
  rectFromResizePointer,
  readingOrder,
  rectsOverlap,
} from '@/lib/vendor/outlet-grid';

describe('outlet grid geometry', () => {
  it('detects overlapping and touching rectangles', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 2, w: 2, h: 2 })).toBe(false);
  });

  it('rejects rectangles out of bounds or colliding, ignoring the excluded id', () => {
    const placed = [{ id: 'a', x: 0, y: 0, w: 4, h: 2 }];
    expect(fits(placed, { x: 4, y: 0, w: 4, h: 2 }, GRID_COLS, 10)).toBe(true);
    expect(fits(placed, { x: 5, y: 0, w: 4, h: 2 }, GRID_COLS, 10)).toBe(false);
    expect(fits(placed, { x: 0, y: 9, w: 2, h: 2 }, GRID_COLS, 10)).toBe(false);
    expect(fits(placed, { x: 2, y: 0, w: 2, h: 2 }, GRID_COLS, 10)).toBe(false);
    expect(fits(placed, { x: 2, y: 0, w: 2, h: 2 }, GRID_COLS, 10, 'a')).toBe(true);
  });

  it('finds the first free slot in row-major order, or null when full', () => {
    const placed = [{ id: 'a', x: 0, y: 0, w: 4, h: 2 }];
    expect(firstFreeSlot(placed, 4, 2, GRID_COLS, 10)).toEqual({ x: 4, y: 0 });
    expect(firstFreeSlot([{ id: 'a', x: 0, y: 0, w: 8, h: 2 }], 8, 2, GRID_COLS, 2)).toBeNull();
  });

  it('grows the row count below the lowest widget and never goes under the minimum', () => {
    expect(gridRowCount([])).toBe(GRID_MIN_ROWS);
    expect(gridRowCount([{ x: 0, y: 0, w: 2, h: 2 }])).toBe(GRID_MIN_ROWS);
    expect(gridRowCount([{ x: 0, y: 8, w: 2, h: 2 }])).toBe(13);
  });

  it('sorts into reading order by row then column, stably', () => {
    const order = readingOrder([
      { id: 'c', x: 4, y: 2, w: 2, h: 1 },
      { id: 'a', x: 0, y: 0, w: 2, h: 1 },
      { id: 'b', x: 4, y: 0, w: 2, h: 1 },
    ] as ({ id: string } & { x: number; y: number; w: number; h: number })[]);
    expect(order.map((rect) => rect.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the array it sorts', () => {
    const input = [
      { id: 'b', x: 4, y: 0, w: 2, h: 1 },
      { id: 'a', x: 0, y: 0, w: 2, h: 1 },
    ];
    readingOrder(input);
    expect(input.map((rect) => rect.id)).toEqual(['b', 'a']);
  });

  it('scales content density from the tile size', () => {
    expect(density(2, 2)).toEqual({ columns: 2, items: 2 });
    expect(density(4, 3)).toEqual({ columns: 4, items: 8 });
    expect(density(8, 2)).toEqual({ columns: 4, items: 4 });
    expect(density(1, 1)).toEqual({ columns: 1, items: 1 });
  });

  it('converts direct resize pointer movement into snapped grid dimensions', () => {
    const bounds = { left: 100, top: 40, width: 800 };
    const original = { x: 2, y: 1, w: 2, h: 2 };

    expect(rectFromResizePointer(bounds, 700, 40, original, 92, GRID_COLS, 'east')).toEqual({
      x: 2, y: 1, w: 4, h: 2,
    });
    expect(rectFromResizePointer(bounds, 100, 500, original, 92, GRID_COLS, 'south')).toEqual({
      x: 2, y: 1, w: 2, h: 4,
    });
    expect(rectFromResizePointer(bounds, 900, 1052, original, 92, GRID_COLS, 'south-east')).toEqual({
      x: 2, y: 1, w: 6, h: 10,
    });
  });

  it('clamps direct resizing to minimum dimensions and the canvas bounds', () => {
    const bounds = { left: 100, top: 40, width: 800 };
    const original = { x: 2, y: 1, w: 2, h: 2 };

    expect(rectFromResizePointer(bounds, 100, 40, original, 92, GRID_COLS, 'south-east', 2, 2)).toEqual({
      x: 2, y: 1, w: 2, h: 2,
    });
    expect(rectFromResizePointer(bounds, 900, 1052, original, 92, GRID_COLS, 'south-east', 2, 2)).toEqual({
      x: 2, y: 1, w: 6, h: 10,
    });
  });
});
