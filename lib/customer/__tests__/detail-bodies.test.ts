import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDetailBody } from "@/app/customer/activity/[id]/bodies";
import type { ComputedActivity } from "@/backend/core/types";

const bookable = { requiresBooking: true } as ComputedActivity;
const instant = { requiresBooking: false } as ComputedActivity;

describe("getDetailBody", () => {
  it("gives each category its own purchase language", () => {
    expect(getDetailBody("activity").panelKicker).toBe("Ready to book");
    expect(getDetailBody("food").panelKicker).toBe("Ready to order");
    expect(getDetailBody("retail").panelKicker).toBe("Ready to buy");
    expect(getDetailBody("accommodation").panelKicker).toBe("Ready to stay");
  });

  it("counts goods as items, not persons", () => {
    expect(getDetailBody("retail").quantityLabel(2)).toBe("2 items");
    expect(getDetailBody("food").quantityLabel(1)).toBe("1 item");
    expect(getDetailBody("activity").quantityLabel(2)).toBe("2 persons");
    expect(getDetailBody("accommodation").quantityLabel(3)).toBe("3 nights");
  });

  it("only offers a slot picker to the categories that book a time", () => {
    expect(getDetailBody("activity").Options).not.toBeNull();
    expect(getDetailBody("accommodation").Options).not.toBeNull();
    expect(getDetailBody("food").Options).toBeNull();
    expect(getDetailBody("retail").Options).toBeNull();
  });

  it("falls back to the activity body for an unknown or missing category", () => {
    expect(getDetailBody("some-future-category")).toBe(getDetailBody("activity"));
    expect(getDetailBody(undefined)).toBe(getDetailBody("activity"));
    expect(getDetailBody(null)).toBe(getDetailBody("activity"));
  });

  it("switches the activity panel title on whether the product books a slot", () => {
    expect(getDetailBody("activity").panelTitle(bookable)).toBe("Select your visit");
    expect(getDetailBody("activity").panelTitle(instant)).toBe("Choose your options");
  });
});

describe("booking panel extraction", () => {
  const shell = readFileSync(
    resolve(process.cwd(), "app/customer/activity/[id]/activity-detail-client.tsx"),
    "utf8",
  );

  it("no longer inlines the slot picker — it belongs to the bodies now", () => {
    expect(shell).not.toContain("formatBookingSlotTime");
    expect(shell).not.toContain("groupBookingSlotsByDate");
    expect(shell).not.toContain("Available times");
  });

  it("still owns the state the cart needs", () => {
    expect(shell).toContain("addItem({");
    expect(shell).toContain("slotId: slotId || undefined");
  });
});
