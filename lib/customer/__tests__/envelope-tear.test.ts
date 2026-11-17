import { describe, expect, it } from "vitest";
import { buildZipStrip, createEnvelopeGeometry, splitOpenLayout } from "@/lib/customer/envelope-tear";

const desktop = createEnvelopeGeometry(1200, false);

describe("envelope zip-strip geometry", () => {
  it("never throws for progress outside 0..1 and clamps it", () => {
    // A rAF timestamp can predate the tween start, giving a slightly negative progress.
    expect(() => buildZipStrip(-0.01, desktop)).not.toThrow();
    expect(() => buildZipStrip(1.2, desktop)).not.toThrow();
    expect(buildZipStrip(-0.01, desktop)).toEqual(buildZipStrip(0, desktop));
    expect(buildZipStrip(1.2, desktop)).toEqual(buildZipStrip(1, desktop));
  });

  it("opens only the part of the strip behind the tab without a folded piece", () => {
    const pieces = buildZipStrip(0.5, desktop);
    expect(pieces.map((piece) => piece.k)).toEqual(["bottom", "top"]);

    const frontX = (desktop.W - desktop.ovh) / 2;
    const middleY = desktop.a + desktop.sh / 2;
    const covers = (x: number, y: number) => pieces.some(({ outer = [] }) =>
      outer.filter(([ax, ay], index) => {
        const [bx, by] = outer[(index + 1) % outer.length];
        return (ay > y) !== (by > y) && ax + (bx - ax) * (y - ay) / (by - ay) > x;
      }).length % 2 === 1);
    expect(covers(frontX - 12, middleY)).toBe(false);
    expect(covers(frontX + 12, middleY)).toBe(true);
  });

  it("is deterministic for the same width", () => {
    expect(createEnvelopeGeometry(1200, false).L1.pts).toEqual(desktop.L1.pts);
  });

  it("uses the planned desktop and narrow sizes", () => {
    expect(desktop).toMatchObject({ H: 460, a: 264, sh: 48, ovh: 30 });
    expect(createEnvelopeGeometry(360, true)).toMatchObject({ H: 500, a: 250, sh: 46, ovh: 12 });
    expect(desktop).not.toHaveProperty("tuck");
  });

  it("starts both tear lines at the strip's left overhang", () => {
    for (const geometry of [desktop, createEnvelopeGeometry(360, true)]) {
      expect(geometry.L1.pts[0].x).toBe(-geometry.ovh);
      expect(geometry.L2.pts[0].x).toBe(-geometry.ovh);
    }
  });

  it("closes the top piece along the ragged lower tear line, not a straight edge", () => {
    const { L2 } = desktop, n = L2.n;
    const outer = buildZipStrip(0, desktop).find((piece) => piece.k === "top")?.outer ?? [];
    expect(outer).toHaveLength(n + 1 + 3);
    // The edge runs right to left: outer[2 + j] sits just over L2.pts[n - j].
    for (let j = 0; j <= n; j++) {
      const [x, y] = outer[2 + j], pt = L2.pts[n - j];
      expect(x).toBeCloseTo(pt.x, 6);
      expect(Math.abs(y - pt.y)).toBeLessThanOrEqual(2);
    }
  });
});

describe("splitOpenLayout", () => {
  // Tear band 264..312 in card coordinates, a 400px letter, 900px screen, 64px header.
  const base = { tearTop: 264, tearBottom: 312, letterHeight: 400, headerBottom: 64, viewportHeight: 900 };
  it("centres the letter on the tear when there is room", () => {
    expect(splitOpenLayout({ ...base, cardTop: 200 }).letterTop).toBe(288 - 200);
  });
  it("moves the letter down when the card sits right under the header", () => {
    // Centred would start at 88 + (-150) = -62 on screen, above the header bottom.
    expect(splitOpenLayout({ ...base, cardTop: -150 }).letterTop).toBe(64 + 12 + 150);
  });
  it("moves the letter up when the card is near the screen bottom", () => {
    expect(splitOpenLayout({ ...base, cardTop: 700 }).letterTop).toBe(900 - 12 - 400 - 700);
  });
  it("lets the header win when the screen is too short for both limits", () => {
    expect(splitOpenLayout({ ...base, viewportHeight: 300, cardTop: 100 }).letterTop).toBe(64 + 12 - 100);
  });
  it("leaves exactly 8px between each half and the letter", () => {
    const out = splitOpenLayout({ ...base, cardTop: 200 });
    expect(out.letterTop - (base.tearTop + out.topShift)).toBe(8);
    expect(base.tearBottom + out.bottomShift - (out.letterTop + base.letterHeight)).toBe(8);
  });
});
