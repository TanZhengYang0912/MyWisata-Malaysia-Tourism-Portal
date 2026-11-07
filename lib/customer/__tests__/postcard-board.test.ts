import { describe, expect, it } from "vitest";
import { assignPostcardSlots, SLOTS, stringPath, toBoardPoint } from "@/lib/customer/postcard-board";

// 16 anchors spread like Malaysia: a peninsula on the left, Borneo on the right.
const anchors = Array.from({ length: 16 }, (_, i) => ({
  id: `s${i}`,
  x: i < 12 ? 260 + (i % 4) * 40 : 620 + (i - 12) * 60,
  y: i < 12 ? 200 + Math.floor(i / 4) * 90 : 300 + ((i - 12) % 2) * 60,
}));

describe("assignPostcardSlots", () => {
  it("gives 16 anchors 16 different slots, the same way every time", () => {
    const result = assignPostcardSlots(anchors);
    expect(new Set(Object.values(result)).size).toBe(16);
    expect(Object.keys(result).sort()).toEqual(anchors.map((a) => a.id).sort());
    expect(assignPostcardSlots(anchors)).toEqual(result);
  });

  it("puts a north-west anchor on a top or left slot", () => {
    const slot = SLOTS[assignPostcardSlots(anchors).s0];
    expect(slot.y === 22 || slot.x === 30).toBe(true);
  });

  it("leaves slots empty when there are fewer anchors", () => {
    const result = assignPostcardSlots(anchors.slice(0, 10));
    expect(new Set(Object.values(result)).size).toBe(10);
    expect(Object.values(result).every((slot) => slot >= 0 && slot < 16)).toBe(true);
  });

  it("refuses more anchors than slots", () => {
    expect(() => assignPostcardSlots([...anchors, { id: "extra", x: 0, y: 0 }])).toThrow();
  });
});

describe("board geometry", () => {
  it("maps the state map viewBox corners onto the board's map box", () => {
    expect(toBoardPoint({ x: 0, y: 100 })).toEqual({ x: 200, y: 150 });
    expect(toBoardPoint({ x: 1600, y: 960 })).toEqual({ x: 900, y: 526.25 });
  });

  it("draws a string that starts and ends at the given points", () => {
    expect(stringPath({ x: 105, y: 24 }, { x: 300, y: 250 })).toBe("M105,24 Q202.5,290 300,250");
  });
});
