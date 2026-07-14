import { describe, expect, it } from "vitest";
import { getVisibleDestinationQueue, rotateDestinationQueue } from "@/lib/customer/malaysia-destinations";

describe("getVisibleDestinationQueue", () => {
  it("keeps a fixed set of destination card slots after removing the spotlight card", () => {
    const destinations = [
      { state: "Kuala Lumpur" },
      { state: "Sabah" },
      { state: "Penang" },
      { state: "Johor" },
      { state: "Sarawak" },
      { state: "Kedah" },
    ];

    expect(getVisibleDestinationQueue(destinations, "Kuala Lumpur", 5).map((item) => item.state)).toEqual([
      "Sabah",
      "Penang",
      "Johor",
      "Sarawak",
      "Kedah",
    ]);
  });
});

describe("rotateDestinationQueue", () => {
  it("moves the selected destination to the end", () => {
    expect(rotateDestinationQueue(["Kuala Lumpur", "Sabah", "Penang", "Johor"], 1)).toEqual([
      "Kuala Lumpur",
      "Penang",
      "Johor",
      "Sabah",
    ]);
  });

  it("keeps invalid selections unchanged", () => {
    const items = ["Kuala Lumpur", "Sabah"];
    expect(rotateDestinationQueue(items, -1)).toBe(items);
    expect(rotateDestinationQueue(items, 2)).toBe(items);
  });
});
