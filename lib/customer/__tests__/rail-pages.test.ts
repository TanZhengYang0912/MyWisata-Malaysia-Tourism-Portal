import { describe, expect, it } from "vitest";
import { railPagePosition } from "@/lib/customer/rail-pages";

const step = 900;
const at = (scrollLeft: number, cardsPerStep: number) =>
  railPagePosition({ scrollLeft, pageStep: step, scrollWidth: cardsPerStep * step, clientWidth: step });

describe("railPagePosition", () => {
  it("counts full pages when the cards divide evenly", () => {
    expect(at(0, 4)).toEqual({ pageCount: 4, progress: 0, page: 0 });
    expect(at(2 * step, 4)).toEqual({ pageCount: 4, progress: 2, page: 2 });
  });

  it("gives a part-full last page its own dot, reached at the end of the rail", () => {
    const pages = 16 / 3;
    const max = pages * step - step;
    expect(at(0, pages).pageCount).toBe(6);
    expect(at(4 * step, pages).progress).toBeCloseTo(4);
    expect(at(4 * step + (max - 4 * step) / 2, pages).progress).toBeCloseTo(4.5);
    expect(at(max, pages)).toEqual({ pageCount: 6, progress: 5, page: 5 });
  });

  it("ignores subpixel rounding in the scroll width", () => {
    expect(railPagePosition({ scrollLeft: 0, pageStep: step, scrollWidth: 4 * step + 0.4, clientWidth: step }).pageCount).toBe(4);
  });

  it("treats an unmeasured rail as one page", () => {
    expect(railPagePosition({ scrollLeft: 0, pageStep: 0, scrollWidth: 0, clientWidth: 0 })).toEqual({ pageCount: 1, progress: 0, page: 0 });
  });
});
