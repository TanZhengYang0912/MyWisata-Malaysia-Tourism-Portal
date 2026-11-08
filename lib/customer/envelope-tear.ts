// Geometry for the home campaign envelope's tear strip. Pure functions only;
// components/customer/campaign-envelope.tsx applies the results to the DOM.

export type Pt = { x: number; y: number };
export type TearLine = { pts: Pt[]; vx: number; vy: number; n: number };
export type EnvelopeGeometry = {
  W: number; H: number; a: number; sh: number;
  L1: TearLine; L2: TearLine;
  c1t: number[]; c1f: number[]; c2f: number[]; c2b: number[];
};
export type Piece = {
  k: "bottom" | "top" | "flap";
  outer?: [number, number][];
  inner?: [number, number][];
  fold?: { h1: Pt; h2: Pt; phi: number; toward: Pt };
};
export type EnvelopeState = "closed" | "busy" | "open" | "gone";

/** How far untorn edges overlap so no hairline shows between pieces. */
const OV = 1.5;
/** How far the pieces' outer edges reach past the card, so drop shadows are not cut. */
const E = 44;
/** Width of the ragged white paper gap that opens along a torn edge. */
const GAP = 5;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = (t: number) => t * t * (3 - 2 * t);

/** A seeded ragged line from S to End, with its left unit normal. */
function rag(S: Pt, End: Pt, amp: number, fine: number, seed: number, step = 5): TearLine {
  const dx = End.x - S.x, dy = End.y - S.y, len = Math.hypot(dx, dy), vx = -dy / len, vy = dx / len;
  const r = rng(seed), f1 = r() * 6.3, f2 = r() * 6.3, n = Math.max(2, Math.round(len / step)), pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, d = t * len;
    const off = amp * (Math.sin(d / 57 + f1) * 0.65 + Math.sin(d / 17 + f2) * 0.35) + fine * (r() * 2 - 1);
    pts.push({ x: S.x + dx * t + vx * off, y: S.y + dy * t + vy * off });
  }
  return { pts, vx, vy, n };
}

/** Width of the white paper core exposed at each point of a torn edge. */
function coreOf(n: number, lo: number, hi: number, seed: number) {
  const r = rng(seed), f = r() * 6.3;
  return Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * (0.5 + 0.5 * Math.sin(i / 6 + f)) * (0.45 + 0.55 * r()));
}

/** Points along one side of a tear line: torn points pull back, untorn points overlap. */
function edge(L: TearLine, side: number, core: number[], fi: number, inner: boolean, from: number, to: number) {
  const out: [number, number][] = [], dir = from <= to ? 1 : -1;
  for (let i = from; dir > 0 ? i <= to : i >= to; i += dir) {
    const torn = i < fi, gap = torn ? GAP * Math.min(1, (fi - i) / 16) : 0;
    const off = torn ? gap + (inner ? core[i] : 0) : -OV;
    out.push([L.pts[i].x + L.vx * side * off, L.pts[i].y + L.vy * side * off]);
  }
  return out;
}

function frontPt(L: TearLine, fi: number): Pt {
  const i = Math.min(L.n - 1, Math.floor(fi)), t = fi - i, a = L.pts[i], b = L.pts[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const two = (fn: (inner: boolean) => [number, number][]) => ({ outer: fn(false), inner: fn(true) });
const shift = (pt: Pt, n: Pt): [number, number] => [pt.x + n.x * OV, pt.y + n.y * OV];

export function createEnvelopeGeometry(W: number, narrow: boolean): EnvelopeGeometry {
  const H = narrow ? 480 : 460, a = narrow ? 236 : 264, sh = narrow ? 44 : 48;
  const L1 = rag({ x: -30, y: a }, { x: W, y: a }, 3, 1.6, 11);
  const L2 = rag({ x: -30, y: a + sh }, { x: W, y: a + sh }, 3, 1.6, 12);
  const n = L1.n;
  return { W, H, a, sh, L1, L2, c1t: coreOf(n, 2, 10, 41), c1f: coreOf(n, 1, 3, 42), c2f: coreOf(n, 1, 3, 43), c2b: coreOf(n, 2, 10, 44) };
}

/** The envelope cut into the part above the strip, the part below it, and the torn strip curling back over its hinge. */
export function buildZipStrip(progress: number, g: EnvelopeGeometry): Piece[] {
  const p = Math.max(0, Math.min(1, progress));
  const { W, H, L1, L2, c1t, c1f, c2f, c2b } = g, n = L1.n, fi = p * n, k = Math.ceil(fi) - 1, left = { x: -1, y: 0 };
  const bottom = two((inr) => [[-E, L2.pts[0].y], ...edge(L2, 1, c2b, fi, inr, 0, n), [W + E, L2.pts[n].y], [W + E, H + E], [-E, H + E]]);
  if (k < 0) {
    return [
      { k: "bottom", ...bottom },
      { k: "top", ...two(() => [[-E, -E], [W + E, -E], [W + E, L2.pts[n].y + OV], [-E, L2.pts[0].y + OV]]) },
      { k: "flap" },
    ];
  }
  const F1 = frontPt(L1, fi), F2 = frontPt(L2, fi);
  const top = two((inr) => [[-E, -E], [W + E, -E], [W + E, L2.pts[n].y], ...edge(L2, -1, c2b, fi, inr, n, k + 1), shift(F2, left), shift(F1, left), ...edge(L1, -1, c1t, fi, inr, k, 0), [-E, L1.pts[0].y - 10]]);
  const flap = two((inr) => [...edge(L1, 1, c1f, fi, inr, 0, k), [F1.x, F1.y], [F2.x, F2.y], ...edge(L2, -1, c2f, fi, inr, k, 0)]);
  return [
    { k: "bottom", ...bottom },
    { k: "top", ...top },
    { k: "flap", ...flap, fold: { h1: F1, h2: F2, phi: 150 * ease(Math.min(1, p / 0.08)), toward: left } },
  ];
}

/** Reflects a piece across the hinge line a→b by phi radians, as a CSS matrix. */
export function foldMatrix(a: Pt, b: Pt, phiRad: number) {
  const ux = b.x - a.x, uy = b.y - a.y, l = Math.hypot(ux, uy), nx = -uy / l, ny = ux / l, k = Math.cos(phiRad) - 1;
  const m00 = 1 + k * nx * nx, m01 = k * nx * ny, m11 = 1 + k * ny * ny;
  return `matrix(${m00},${m01},${m01},${m11},${a.x - (m00 * a.x + m01 * a.y)},${a.y - (m01 * a.x + m11 * a.y)})`;
}

export const toPolygon = (list: [number, number][]) => `polygon(${list.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;

/**
 * Where the letter sits once the envelope splits open, in px from the card top:
 * centred on the tear, but kept inside the screen below the sticky header (the
 * header wins when both limits clash). The two halves follow with an 8px gap.
 */
export function splitOpenLayout(o: { tearTop: number; tearBottom: number; letterHeight: number; cardTop: number; headerBottom: number; viewportHeight: number }) {
  const preferred = (o.tearTop + o.tearBottom) / 2 - o.letterHeight / 2;
  const lo = o.headerBottom + 12 - o.cardTop, hi = o.viewportHeight - 12 - o.letterHeight - o.cardTop;
  const letterTop = Math.round(lo > hi ? lo : Math.min(hi, Math.max(lo, preferred)));
  return { letterTop, topShift: letterTop - 8 - o.tearTop, bottomShift: letterTop + o.letterHeight + 8 - o.tearBottom };
}

/** What to do once the pointer/focus wish and the animation state disagree. */
export function nextEnvelopeAction(state: EnvelopeState, wantOpen: boolean): "open" | "close" | null {
  if (state === "closed" && wantOpen) return "open";
  if (state === "open" && !wantOpen) return "close";
  return null;
}
