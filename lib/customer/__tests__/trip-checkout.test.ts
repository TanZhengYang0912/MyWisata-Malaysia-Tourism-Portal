import { describe, expect, it } from "vitest";
import type { BookingSlot, ComputedActivity } from "@/backend/core/types";
import type { TripItem } from "@/backend/domains/trips";
import { resolveTripCheckoutLines } from "@/lib/customer/trip-checkout";

function item(id: string, overrides: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: "trip-1",
    experience_id: id,
    sequence: 0,
    scheduled_date: "2026-10-15",
    scheduled_time: null,
    created_at: "2026-08-01T00:00:00.000Z",
    source: "vendor",
    lat: 5.4,
    lng: 100.3,
    label: id,
    ...overrides,
  };
}

function activity(id: string, overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id,
    outletId: "outlet-1",
    name: id,
    category: "Activity",
    description: "",
    image: null,
    price: 50,
    rating: 4.5,
    reviews: 10,
    duration: "2h",
    requiresBooking: false,
    variants: [{ id: "variant-1", label: "Adult", priceDelta: 0 }],
    outlet: {
      id: "outlet-1",
      vendorId: "vendor-1",
      vendorName: "Real Vendor",
      name: "Real Outlet",
      category: "Activity",
      state: "Penang",
      city: "George Town",
      address: "1 Jalan Test",
      lat: 5.4,
      lng: 100.3,
    },
    ...overrides,
  } as ComputedActivity;
}

function slot(id: string, startsAt: string, overrides: Partial<BookingSlot> = {}): BookingSlot {
  return { id, activityId: "petronas", startsAt, capacity: 10, booked: 0, status: "available", ...overrides };
}

describe("resolveTripCheckoutLines", () => {
  it("adds a non-booking vendor item as a plain cart line, no slot needed", () => {
    const { lines, needsSlot } = resolveTripCheckoutLines(
      [item("laksa")],
      new Map([["laksa", activity("laksa")]]),
      new Map(),
    );

    expect(lines).toEqual([{ activityId: "laksa", variantId: "variant-1", outletId: "outlet-1", qty: 1 }]);
    expect(needsSlot).toEqual([]);
  });

  it("skips a free self-guided place — nothing to buy", () => {
    const base = activity("trail");
    const publicPlace = activity("trail", {
      price: 0,
      requiresBooking: false,
      typeSlugs: ["nature"],
      outlet: { ...base.outlet, vendorId: "", vendorName: "" },
    });

    const { lines, needsSlot } = resolveTripCheckoutLines([item("trail")], new Map([["trail", publicPlace]]), new Map());

    expect(lines).toEqual([]);
    expect(needsSlot).toEqual([]);
  });

  it("picks the earliest open slot on the scheduled day when the item has no time", () => {
    const petronas = activity("petronas", { requiresBooking: true });
    const slots = new Map([["petronas", [
      slot("late", "2026-10-15T14:00:00+08:00"),
      slot("early", "2026-10-15T09:00:00+08:00"),
    ]]]);

    const { lines } = resolveTripCheckoutLines([item("petronas")], new Map([["petronas", petronas]]), slots);

    expect(lines).toEqual([{ activityId: "petronas", variantId: "variant-1", outletId: "outlet-1", slotId: "early", qty: 1 }]);
  });

  it("picks the slot closest to the item's own scheduled time", () => {
    const petronas = activity("petronas", { requiresBooking: true });
    const slots = new Map([["petronas", [
      slot("morning", "2026-10-15T09:00:00+08:00"),
      slot("afternoon", "2026-10-15T15:00:00+08:00"),
    ]]]);

    const { lines } = resolveTripCheckoutLines(
      [item("petronas", { scheduled_time: "14:30" })],
      new Map([["petronas", petronas]]),
      slots,
    );

    expect(lines[0].slotId).toBe("afternoon");
  });

  it("reports needsSlot instead of fabricating a slot on a different day", () => {
    const petronas = activity("petronas", { requiresBooking: true });
    const slots = new Map([["petronas", [slot("next-day", "2026-10-16T09:00:00+08:00")]]]);

    const { lines, needsSlot } = resolveTripCheckoutLines([item("petronas")], new Map([["petronas", petronas]]), slots);

    expect(lines).toEqual([]);
    expect(needsSlot).toEqual([{ itemId: "petronas", label: "petronas" }]);
  });

  it("treats a fully-booked slot as unavailable, same as no slot at all", () => {
    const petronas = activity("petronas", { requiresBooking: true });
    const slots = new Map([["petronas", [slot("full", "2026-10-15T09:00:00+08:00", { booked: 10, status: "full" })]]]);

    const { lines, needsSlot } = resolveTripCheckoutLines([item("petronas")], new Map([["petronas", petronas]]), slots);

    expect(lines).toEqual([]);
    expect(needsSlot).toEqual([{ itemId: "petronas", label: "petronas" }]);
  });

  it("books a slot-only product with zero variants — real catalogue data, this was the bug", () => {
    // Reproduces real seed data: several booking-required products (e.g.
    // "Standard Entrance Pass", "Adult Admission") have no product_variants
    // row at all — the slot alone is meant to back the cart line.
    const petronas = activity("petronas", { requiresBooking: true, variants: [] });
    const slots = new Map([["petronas", [slot("morning", "2026-10-15T09:00:00+08:00")]]]);

    const { lines, needsSlot } = resolveTripCheckoutLines([item("petronas")], new Map([["petronas", petronas]]), slots);

    expect(lines).toEqual([{ activityId: "petronas", variantId: "", outletId: "outlet-1", slotId: "morning", qty: 1 }]);
    expect(needsSlot).toEqual([]);
  });

  it("skips a non-booking product with zero variants — genuinely nothing to back the line", () => {
    const noVariant = activity("no-variant", { variants: [] });

    const { lines, needsSlot } = resolveTripCheckoutLines([item("no-variant")], new Map([["no-variant", noVariant]]), new Map());

    expect(lines).toEqual([]);
    expect(needsSlot).toEqual([]);
  });

  it("skips a custom location stop with no experience_id", () => {
    const { lines, needsSlot } = resolveTripCheckoutLines(
      [item("hotel", { experience_id: null, source: "location" })],
      new Map(),
      new Map(),
    );

    expect(lines).toEqual([]);
    expect(needsSlot).toEqual([]);
  });
});
