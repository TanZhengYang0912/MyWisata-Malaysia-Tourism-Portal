import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/vendor/bookings/page.tsx"),
  "utf8",
);

describe("vendor booking workspace clarity", () => {
  it("keeps weekly hours concise until the manager chooses to edit them", () => {
    expect(source).toContain(
      "const [isScheduleEditorOpen, setScheduleEditorOpen]",
    );
    expect(source).toContain('"ui.bookings.editSchedule"');
    expect(source).toContain('"ui.bookings.scheduleSummary"');
    expect(source).toContain("isScheduleEditorOpen &&");
  });

  it("uses the established booking-slot availability rule for stale slot data", () => {
    expect(source).toContain('from "@/lib/customer/booking-slot-presenter"');
    expect(source).toContain("function getSlotDisplayStatus");
    expect(source).toContain("getBookingSlotAvailability");
  });

  it("renders a stable slot reference and clear management columns", () => {
    expect(source).toContain("function slotReference");
    expect(source).toContain("reference: slotReference(slot)");
    expect(source).toContain('"ui.bookings.slotTime"');
    expect(source).toContain('"ui.bookings.bookedCapacity"');
    expect(source).toContain('"ui.bookings.slotStatus"');
  });
});
