import { describe, expect, it } from "vitest";
import {
  getVisibleDestinationQueue,
  MALAYSIA_DESTINATIONS,
  rotateDestinationQueue,
} from "@/lib/customer/malaysia-destinations";

describe("MALAYSIA_DESTINATIONS", () => {
  it("keeps one unique destination per Malaysian state in the 16-item source of truth", () => {
    expect(MALAYSIA_DESTINATIONS).toHaveLength(16);
    expect(new Set(MALAYSIA_DESTINATIONS.map((destination) => destination.state)).size).toBe(16);
    expect(
      MALAYSIA_DESTINATIONS.every((destination) =>
        destination.image.includes("/storage/v1/object/public/place-images/malaysia/"),
      ),
    ).toBe(true);
  });

  it("gives every destination a concise introduction and three highlights", () => {
    for (const destination of MALAYSIA_DESTINATIONS) {
      expect(destination.intro.trim()).not.toBe("");
      expect(destination.highlights).toHaveLength(3);
      expect(destination.highlights.every((item) => item.trim().length > 0)).toBe(true);
    }
  });
});

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
