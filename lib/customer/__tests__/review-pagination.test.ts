import { describe, expect, it } from "vitest";
import { getReviewPageState } from "@/lib/customer/review-pagination";

describe("review pagination", () => {
  it("calculates the first page and exposes a next page", () => {
    expect(getReviewPageState(27, 1, 5)).toEqual({
      page: 1,
      pageSize: 5,
      total: 27,
      totalPages: 6,
      offset: 0,
      hasPrevious: false,
      hasNext: true,
    });
  });

  it("clamps an out-of-range page to the last page", () => {
    expect(getReviewPageState(27, 99, 5)).toEqual({
      page: 6,
      pageSize: 5,
      total: 27,
      totalPages: 6,
      offset: 25,
      hasPrevious: true,
      hasNext: false,
    });
  });
});
