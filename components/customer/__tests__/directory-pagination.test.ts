import { describe, expect, it } from "vitest";
import { getPageItems } from "@/components/customer/directory-pagination";

describe("getPageItems", () => {
  it("lists every page when there are seven or fewer", () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses the middle with an ellipsis when near the start", () => {
    expect(getPageItems(1, 20)).toEqual([1, 2, "ellipsis", 20]);
  });

  it("keeps a window around the current page", () => {
    expect(getPageItems(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
  });

  it("collapses the middle when near the end", () => {
    expect(getPageItems(20, 20)).toEqual([1, "ellipsis", 19, 20]);
  });

  it("never emits a page outside the range", () => {
    expect(getPageItems(1, 1)).toEqual([1]);
  });
});
