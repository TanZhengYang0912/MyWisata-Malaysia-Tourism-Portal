import { describe, expect, it } from "vitest";
import { getCustomerCalendarUiState } from "@/lib/customer/event-calendar-ui-state";
import type { CustomerCalendarEvent } from "@/lib/customer/event-calendar";

describe("customer event calendar UI state", () => {
  it.each([
    ["idle", 0, "loading"],
    ["loading", 0, "loading"],
    ["success", 0, "empty"],
    ["success", 2, "ready"],
    ["error", 0, "error"],
    ["error", 2, "error"],
  ] as const)("maps %s with %i events to %s", (loadStatus, eventCount, expected) => {
    expect(getCustomerCalendarUiState(loadStatus, eventCount)).toBe(expected);
  });

  it("chooses the earliest valid event regardless of response order", async () => {
    const uiState = await import("@/lib/customer/event-calendar-ui-state") as unknown as {
      getEarliestCustomerCalendarEvent?: (events: CustomerCalendarEvent[]) => CustomerCalendarEvent | null;
    };
    expect(uiState).toHaveProperty("getEarliestCustomerCalendarEvent");

    const makeEvent = (id: string, start: string): CustomerCalendarEvent => ({
      id,
      title: id,
      start,
      end: start,
      extendedProps: {
        activityId: id,
        outletId: `${id}-outlet`,
        outletName: "Kuala Lumpur",
        remainingCapacity: 4,
        requiresBooking: true,
        isAccommodation: false,
      },
    });
    const earliest = makeEvent("earliest", "2026-09-26T02:00:00.000Z");
    const later = makeEvent("later", "2026-09-28T02:00:00.000Z");
    const invalid = makeEvent("invalid", "not-a-date");

    expect(uiState.getEarliestCustomerCalendarEvent?.([later, invalid, earliest])).toEqual(earliest);
    expect(uiState.getEarliestCustomerCalendarEvent?.([invalid])).toBeNull();
  });
});
