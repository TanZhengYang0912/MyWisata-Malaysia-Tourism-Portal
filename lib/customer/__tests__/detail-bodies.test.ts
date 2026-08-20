import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDetailBody } from "@/app/customer/activity/[id]/bodies";
import type { ComputedActivity } from "@/backend/core/types";

const bookable = { requiresBooking: true } as ComputedActivity;
const instant = { requiresBooking: false } as ComputedActivity;

describe("getDetailBody", () => {
  it("gives each category its own purchase language", () => {
    expect(getDetailBody("activity").panelKickerKey).toBe("strictMigration.activityDetail.readyToBook");
    expect(getDetailBody("food").panelKickerKey).toBe("strictMigration.activityDetail.readyToOrder");
    expect(getDetailBody("retail").panelKickerKey).toBe("strictMigration.activityDetail.readyToBuy");
    expect(getDetailBody("accommodation").panelKickerKey).toBe("strictMigration.activityDetail.readyToStay");
  });

  it("counts goods as items, not persons", () => {
    expect(getDetailBody("retail").quantityLabelKey).toBe("strictMigration.activityDetail.itemCount");
    expect(getDetailBody("food").quantityLabelKey).toBe("strictMigration.activityDetail.itemCount");
    expect(getDetailBody("activity").quantityLabelKey).toBe("strictMigration.activityDetail.personCount");
    expect(getDetailBody("accommodation").quantityLabelKey).toBe("strictMigration.activityDetail.nightCount");
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
    expect(getDetailBody("activity").panelTitleKey(bookable)).toBe("strictMigration.activityDetail.selectVisit");
    expect(getDetailBody("activity").panelTitleKey(instant)).toBe("strictMigration.activityDetail.chooseOptions");
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
