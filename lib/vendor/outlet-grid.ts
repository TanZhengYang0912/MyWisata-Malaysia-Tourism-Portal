// Placement math for the outlet page grid — plain geometry, no layout library.
// Blocks occupy an axis-aligned rect on an 8-column grid with fixed-height
// rows; a placement is valid when the rect is in-bounds and doesn't overlap
// another block. Promoted from the app/dev/customize prototype.

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Columns are fixed for every outlet — never a per-outlet setting. */
export const GRID_COLS = 8;
/** Row height in pixels on the desktop canvas and the public grid. */
export const GRID_ROW_PX = 92;
/** Shortest grid we ever render, so an empty page still looks like a canvas. */
export const GRID_MIN_ROWS = 6;
/** Spare rows kept below the lowest block so there is always somewhere to drop. */
export const GRID_TRAILING_ROWS = 3;

/** Sizes offered in the resize menu, widest-use-first. */
export const GRID_SIZE_PRESETS: [number, number][] = [
  [1, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 3], [6, 2], [8, 2],
];

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Is `rect` in-bounds and free of collisions with every other rect (excluding `exceptId`)? */
export function fits(
  rects: (GridRect & { id: string })[],
  rect: GridRect,
  cols: number,
  rows: number,
  exceptId?: string,
): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > cols || rect.y + rect.h > rows) return false;
  return !rects.some((placed) => placed.id !== exceptId && rectsOverlap(placed, rect));
}

/** Row-major scan for the first free (x, y) that fits a `w×h` block, or null if none. */
export function firstFreeSlot(
  rects: (GridRect & { id: string })[],
  w: number,
  h: number,
  cols: number,
  rows: number,
): { x: number; y: number } | null {
  for (let y = 0; y <= rows - h; y += 1) {
    for (let x = 0; x <= cols - w; x += 1) {
      if (fits(rects, { x, y, w, h }, cols, rows)) return { x, y };
    }
  }
  return null;
}

/**
 * Pointer position → grid cell, clamped so a `w×h` block stays in-bounds.
 * Columns are fluid (container width / cols); rows are a fixed pixel height —
 * so x and y each get their own cell size rather than one shared cell.
 */
export function cellFromPointer(
  gridEl: HTMLElement,
  clientX: number,
  clientY: number,
  rowPx: number,
  cols: number,
  rows: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const rect = gridEl.getBoundingClientRect();
  const colPx = rect.width / cols;
  const rawX = Math.round((clientX - rect.left) / colPx);
  const rawY = Math.round((clientY - rect.top) / rowPx);
  return {
    x: Math.max(0, Math.min(cols - w, rawX)),
    y: Math.max(0, Math.min(rows - h, rawY)),
  };
}

/** How many rows to render: enough for every block plus room to drop more. */
export function gridRowCount(rects: GridRect[]): number {
  const lowest = rects.reduce((low, rect) => Math.max(low, rect.y + rect.h), 0);
  return Math.max(GRID_MIN_ROWS, lowest + GRID_TRAILING_ROWS);
}

/**
 * Row-then-column order. This is the order the DOM is emitted in, which is
 * also what a phone shows once the grid collapses to a single column.
 */
export function readingOrder<T extends GridRect>(rects: T[]): T[] {
  return [...rects].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

/**
 * Tile size → how much content fits. A wider tile gets more columns; a taller
 * one gets more rows of them. One row of the tile is reserved for its heading.
 */
export function density(w: number, h: number): { columns: number; items: number } {
  const columns = Math.max(1, Math.min(w, 4));
  return { columns, items: columns * Math.max(1, h - 1) };
}
