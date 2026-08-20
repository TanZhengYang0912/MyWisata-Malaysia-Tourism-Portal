import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const drawerSource = readFileSync(
  resolve(process.cwd(), "components/customer/booking-day-drawer.tsx"),
  "utf8",
);

describe("Booking day drawer", () => {
  it("provides an accessible centered dialog with a close action and order links", () => {
    expect(drawerSource).toContain('role="dialog"');
    expect(drawerSource).toContain('aria-modal="true"');
    expect(drawerSource).toContain('aria-labelledby="booking-day-drawer-title"');
    expect(drawerSource).toContain('aria-label={t("actions.close", { ns: "common" })}');
    expect(drawerSource).toContain('href={`/customer/bookings/${booking.id}`}');
    expect(drawerSource).toContain("items-center justify-center");
    expect(drawerSource).toContain("max-h-[min(780px,calc(100vh-2rem))]");
    expect(drawerSource).not.toContain("inset-y-0 right-0");
  });

  it("supports Escape and restores focus after closing", () => {
    expect(drawerSource).toContain('event.key === "Escape"');
    expect(drawerSource).toContain('event.key !== "Tab"');
    expect(drawerSource).toContain("event.preventDefault()");
    expect(drawerSource).toContain("previousActiveElement?.focus()");
  });

  it("renders grouped itinerary entries without losing their booking links", () => {
    expect(drawerSource).toContain("BookingItineraryGroup");
    expect(drawerSource).toContain("groups:");
    expect(drawerSource).toContain("group.bookings.map");
    expect(drawerSource).toContain("group.totalQty");
    expect(drawerSource).toContain('t("strictMigration.bookingDay.guestBookingCount"');
  });

  it("keeps large booking groups scannable inside a bounded order list", () => {
    expect(drawerSource).toContain('t("ui.labels.bookings")');
    expect(drawerSource).toContain("max-h-56");
    expect(drawerSource).toContain("sm:grid-cols-2");
    expect(drawerSource).toContain("String(index + 1).padStart(2, \"0\")");
    expect(drawerSource).toContain('t("ui.actions.viewBooking")');
    expect(drawerSource).toContain('t("ui.labels.booking")');
    expect(drawerSource).not.toContain("Order #");
    expect(drawerSource).not.toContain("booking.orderId.slice(0, 8)");
    expect(drawerSource).not.toContain("items-center gap-x-3 gap-y-1 border-t");
  });
});
