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

  it("has no flap until the strip starts tearing", () => {
    const flap = buildZipStrip(0, desktop).find((piece) => piece.k === "flap");
    expect(flap?.outer).toBeUndefined();
  });

  it("folds the torn strip fully back once torn all the way", () => {
    const flap = buildZipStrip(1, desktop).find((piece) => piece.k === "flap");
    expect(flap?.fold?.phi).toBe(150);
  });

  it("puts the tear front halfway along the strip at half progress", () => {
    const flap = buildZipStrip(0.5, desktop).find((piece) => piece.k === "flap");
    // The strip runs from x = -30 to x = W.
    expect(Math.abs((flap?.fold?.h1.x ?? 0) - (1200 / 2 - 15))).toBeLessThanOrEqual(10);
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
