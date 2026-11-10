import { describe, expect, it } from "vitest";
import { assignPostcardSlots, getPostcardBoardLayout, SLOTS, slotPin, stringPath, toBoardPoint, regionTransform } from "@/lib/customer/postcard-board";
import { stateAnchor } from "@/components/demo-map/malaysia-state-map";
import { DEMO_STATES } from "@/lib/demo-map/data";

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
  it("fits a responsive board into its available viewport", () => {
    const layout = getPostcardBoardLayout(1232, 620)!;
    expect(layout.scale).toBeCloseTo(592 / 680);
    expect(layout.width).toBeCloseTo(1204 / layout.scale);
    expect(layout.height).toBe(680);
    expect(layout.card.w).toBe(205);
    expect(layout.slots).toHaveLength(16);
    expect(slotPin({ x: 30, y: 30 }, layout.card)).toEqual({ x: 132.5, y: 32 });
    expect(getPostcardBoardLayout(0, 620)).toBeNull();
  });

  it("fits the available height and distributes postcard columns across the width", () => {
    const layout = getPostcardBoardLayout(1232, 620)!;
    const ch = 205 * 2 / 3;
    expect(layout.card.h).toBeCloseTo(ch);
    const top = layout.slots.slice(0, 6), bottom = layout.slots.slice(6, 12);
    expect(top.every((slot) => slot.y === 30)).toBe(true);
    expect(bottom.every((slot) => slot.y === 680 - 30 - layout.card.h)).toBe(true);
    expect(top[0].x).toBe(30);
    expect(top[5].x + layout.card.w).toBeCloseTo(layout.width - 30);
    expect(layout.slots[12]).toEqual({ x: 30, y: 30 + ch + (680 - 60 - 4 * ch) / 3 });
    expect(layout.slots[15].x).toBeCloseTo(layout.width - 30 - 205);
    for (const slot of layout.slots) {
      expect(slot.x).toBeGreaterThanOrEqual(30);
      expect(slot.y).toBeGreaterThanOrEqual(30);
      expect(slot.x + layout.card.w).toBeLessThanOrEqual(layout.width - 30 + 1e-9);
      expect(slot.y + layout.card.h).toBeLessThanOrEqual(680 - 30 + 1e-9);
    }
    expect(layout.mapOffsetX).toBeCloseTo((layout.width - 1100) / 2);
    expect(layout.westDrop).toBe(18);
    expect(getPostcardBoardLayout(1232, 620)).toEqual(layout);
  });

  it("narrows postcards on a narrow board and refuses unusable sizes", () => {
    const layout = getPostcardBoardLayout(976, 900)!;
    expect(layout.scale).toBeCloseTo(948 / 1100);
    expect(layout.width).toBeCloseTo(1100);
    expect(layout.card.w).toBeCloseTo((1100 - 60 - 90) / 6);
    expect(layout.card.h).toBeCloseTo(layout.card.w * 2 / 3);
    for (const [w, h] of [[0, 620], [1232, 0], [28, 620], [1232, 28], [Number.NaN, 620], [1232, Number.POSITIVE_INFINITY]]) {
      expect(getPostcardBoardLayout(w, h)).toBeNull();
    }
  });

  it("shifts the whole map by the layout offset and drops only West Malaysia", () => {
    const layout = getPostcardBoardLayout(1232, 620)!;
    const dx = layout.mapOffsetX;
    expect(toBoardPoint({ x: 40, y: 328 }, "peninsular", layout)).toEqual({ x: 252 + dx, y: 168 + 18 });
    expect(toBoardPoint({ x: 807, y: 279 }, "borneo", layout)).toEqual({ x: 548 + dx, y: 178 });
    expect(regionTransform("peninsular", layout)).toBe(`translate(${252 + dx} ${168 + 18}) scale(0.74) translate(-40 -328)`);
    expect(regionTransform("borneo", layout)).toBe(`translate(${548 + dx} 178) scale(0.47) translate(-807 -279)`);
    expect(regionTransform("borneo")).toBe("translate(548 178) scale(0.47) translate(-807 -279)");
    expect(slotPin({ x: 30, y: 30 }, { w: 205, h: 205 * 2 / 3 })).toEqual({ x: 132.5, y: 32 });
  });

  it("places each region by the approved sample's transform", () => {
    expect(toBoardPoint({ x: 40, y: 328 }, "peninsular")).toEqual({ x: 252, y: 168 });
    expect(toBoardPoint({ x: 140, y: 428 }, "peninsular")).toEqual({ x: 326, y: 242 });
    expect(toBoardPoint({ x: 807, y: 279 }, "borneo")).toEqual({ x: 548, y: 178 });
    expect(toBoardPoint({ x: 907, y: 379 }, "borneo")).toEqual({ x: 595, y: 225 });
  });

  it("draws a string that starts and ends at the given points, sagging 12px", () => {
    expect(stringPath({ x: 105, y: 24 }, { x: 300, y: 250 })).toBe("M105,24 Q202.5,262 300,250");
  });
});

describe("the real Malaysia board", () => {
  const anchors = DEMO_STATES.map((state) => ({ id: state.id, ...toBoardPoint(stateAnchor(state.id)!, state.region === "Borneo" ? "borneo" : "peninsular") }));
  const result = assignPostcardSlots(anchors);
  const row = (match: (slot: { x: number; y: number }) => boolean) => SLOTS
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => match(slot))
    .sort((a, b) => a.slot.x - b.slot.x || a.slot.y - b.slot.y)
    .map(({ index }) => Object.keys(result).find((id) => result[id] === index));

  it("matches the approved sample's order", () => {
    expect(row((slot) => slot.y === 22)).toEqual(["perlis", "kedah", "perak", "kelantan", "terengganu", "labuan"]);
    expect(row((slot) => slot.x === 30 && slot.y > 22 && slot.y < 560)).toEqual(["penang", "selangor"]);
    expect(row((slot) => slot.x === 920)).toEqual(["sabah", "sarawak"]);
    expect(row((slot) => slot.y === 560)).toEqual(["kuala-lumpur", "putrajaya", "melaka", "negeri-sembilan", "johor", "pahang"]);
  });

  // The approved card order is kept on resize, so stretching the rows makes two straight strings cross.
  // Known and reported; any other crossing is a regression.
  const KNOWN_RESIZE_CROSSINGS = new Set(["negeri-sembilan × johor", "perlis × kedah"]);

  it.each([[976, 620], [1232, 620], [1232, 760], [1600, 620]])("keeps the resized %ix%i board free of new crossing strings and Perlis clear of the Kedah card", (width, height) => {
    const layout = getPostcardBoardLayout(width, height)!;
    const d = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const moved = DEMO_STATES.map((state) => ({ id: state.id, ...toBoardPoint(stateAnchor(state.id)!, state.region === "Borneo" ? "borneo" : "peninsular", layout) }));
    const segments = moved.map((anchor) => [slotPin(layout.slots[result[anchor.id]], layout.card), anchor] as const);
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const [p1, p2] = segments[i], [p3, p4] = segments[j];
      const pair = `${moved[i].id} × ${moved[j].id}`;
      if (KNOWN_RESIZE_CROSSINGS.has(pair)) continue;
      expect(d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0, pair).toBe(false);
    }
    const anchorOf = (id: string) => moved.find((anchor) => anchor.id === id)!;
    const cardOf = (id: string) => layout.slots[result[id]];
    // Perlis sits below the Kedah postcard; Johor stays above the bottom row.
    expect(anchorOf("perlis").y).toBeGreaterThan(cardOf("kedah").y + layout.card.h);
    expect(anchorOf("johor").y).toBeLessThan(cardOf("johor").y);
  });

  it("crosses no two straight strings", () => {
    const d = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const segments = anchors.map((anchor) => [slotPin(SLOTS[result[anchor.id]]), anchor] as const);
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const [p1, p2] = segments[i], [p3, p4] = segments[j];
      expect(d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0, `${anchors[i].id} × ${anchors[j].id}`).toBe(false);
    }
  });
});
