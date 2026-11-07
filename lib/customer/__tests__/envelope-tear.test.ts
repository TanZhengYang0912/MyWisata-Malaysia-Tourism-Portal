import { describe, expect, it } from "vitest";
import { buildZipStrip, createEnvelopeGeometry, letterRise, nextEnvelopeAction } from "@/lib/customer/envelope-tear";

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
    expect(desktop).toMatchObject({ H: 440, a: 84, sh: 64, tuck: 40 });
    expect(createEnvelopeGeometry(360, true)).toMatchObject({ H: 480, a: 96, sh: 56, tuck: 40 });
  });
});

describe("letterRise", () => {
  const base = { a: 84, sh: 64, tuck: 40 };
  it("floats the letter up until only the tuck stays inside", () => {
    expect(letterRise({ ...base, letterHeight: 400, cardTop: 600, headerBottom: 64 })).toBe(84 + 64 + 40 - 400 - 76);
  });
  it("stops below the sticky header when headroom is short", () => {
    expect(letterRise({ ...base, letterHeight: 400, cardTop: 90, headerBottom: 64 })).toBe(64 + 8 - 90 - 76);
  });
  it("never moves the letter below the card top", () => {
    expect(letterRise({ ...base, letterHeight: 100, cardTop: 600, headerBottom: 64 })).toBe(0 - 76);
  });
});

describe("nextEnvelopeAction", () => {
  it("only opens a closed envelope and only closes an open one", () => {
    const states = ["closed", "busy", "open", "gone"] as const;
    const results = states.flatMap((state) => [true, false].map((wantOpen) => [state, wantOpen, nextEnvelopeAction(state, wantOpen)]));
    expect(results).toEqual([
      ["closed", true, "open"], ["closed", false, null],
      ["busy", true, null], ["busy", false, null],
      ["open", true, null], ["open", false, "close"],
      ["gone", true, null], ["gone", false, null],
    ]);
  });
});
