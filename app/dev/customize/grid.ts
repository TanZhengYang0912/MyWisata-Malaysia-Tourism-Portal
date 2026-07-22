// Placement math for the free-form widget grid — plain geometry, no layout
// library. Widgets occupy an axis-aligned rect on a fixed COLS×ROWS grid;
// placement is valid when the rect is in-bounds and doesn't overlap another
// widget's rect.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Is `rect` in-bounds and free of collisions with every other rect (excluding `exceptId`)? */
export function fits(rects: (Rect & { id: string })[], rect: Rect, cols: number, rows: number, exceptId?: string): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > cols || rect.y + rect.h > rows) return false;
  return !rects.some((r) => r.id !== exceptId && rectsOverlap(r, rect));
}

/** Row-major scan for the first free (x, y) that fits a `w×h` widget, or null if none. */
export function firstFreeSlot(rects: (Rect & { id: string })[], w: number, h: number, cols: number, rows: number): { x: number; y: number } | null {
  for (let y = 0; y <= rows - h; y += 1) {
    for (let x = 0; x <= cols - w; x += 1) {
      if (fits(rects, { x, y, w, h }, cols, rows)) return { x, y };
    }
  }
  return null;
}

/**
 * Pointer position → grid cell, clamped so a `w×h` widget stays in-bounds.
 * Columns are fluid (container width / cols); rows are a fixed pixel height —
 * so x and y each get their own cell size rather than one shared `cellPx`.
 */
export function cellFromPointer(gridEl: HTMLElement, clientX: number, clientY: number, rowPx: number, cols: number, rows: number, w: number, h: number): { x: number; y: number } {
  const rect = gridEl.getBoundingClientRect();
  const colPx = rect.width / cols;
  const rawX = Math.round((clientX - rect.left) / colPx);
  const rawY = Math.round((clientY - rect.top) / rowPx);
  return {
    x: Math.max(0, Math.min(cols - w, rawX)),
    y: Math.max(0, Math.min(rows - h, rawY)),
  };
}
