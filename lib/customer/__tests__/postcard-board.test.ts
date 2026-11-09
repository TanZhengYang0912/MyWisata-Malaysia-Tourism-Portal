import { describe, expect, it } from "vitest";
import { assignPostcardSlots, SLOTS, slotPin, stringPath, toBoardPoint } from "@/lib/customer/postcard-board";
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

  it("crosses no two straight strings", () => {
    const d = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const segments = anchors.map((anchor) => [slotPin(SLOTS[result[anchor.id]]), anchor] as const);
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const [p1, p2] = segments[i], [p3, p4] = segments[j];
      expect(d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0, `${anchors[i].id} × ${anchors[j].id}`).toBe(false);
    }
  });
});
