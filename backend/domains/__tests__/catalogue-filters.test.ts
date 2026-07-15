import { describe, expect, it } from "vitest";
import { filterActivitiesByVendor } from "@/backend/domains/catalogue-filters";

const activities = [
  { id: "activity-1", outlet: { vendorId: "vendor-a" } },
  { id: "activity-2", outlet: { vendorId: "vendor-b" } },
];

describe("filterActivitiesByVendor", () => {
  it("returns all activities when no vendor is selected", () => {
    expect(filterActivitiesByVendor(activities)).toEqual(activities);
  });

  it("keeps only activities belonging to the selected vendor", () => {
    expect(filterActivitiesByVendor(activities, "vendor-b")).toEqual([activities[1]]);
  });
});
