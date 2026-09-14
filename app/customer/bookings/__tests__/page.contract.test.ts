import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/bookings/[id]/page.tsx"),
  "utf8",
);

describe("customer booking details", () => {
  it("uses the shared customer page frame and title alignment", () => {
    expect(pageSource).toContain('from "@/components/customer/customer-page-shell"');
    expect(pageSource).toContain("CustomerPageShell");
    expect(pageSource).toContain("CustomerPageTitle");
    expect(pageSource).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
  });

  it("shows the full receipt only when the order contains another booking at a different time", () => {
    expect(pageSource).toContain("getBookingForUser");
    expect(pageSource).toContain("getBookingsForOrder");
    expect(pageSource).toContain("booking.activityName");
    expect(pageSource).toContain("booking.slotStartsAt");
    expect(pageSource).toContain("BookingQrCode");
    expect(pageSource).toContain('tCustomer("ui.actions.requestRefund")');
    expect(pageSource).toContain('tCustomer("ui.actions.printReceipt")');
    expect(pageSource).toContain("/api/orders/${booking.orderId}/refund");
    expect(pageSource).toContain("window.print()");
    expect(pageSource).toContain("showFullReceipt");
    expect(pageSource).toContain('tCustomer("strictMigration.bookingReceipt.viewFullReceipt")');
    expect(pageSource).toContain("/customer/orders/${booking.orderId}");
    expect(pageSource.match(/tCustomer\("ui\.actions\.backToCalendar"\)/g)).toHaveLength(1);
    expect(pageSource).not.toContain("booking.qrCode");
    expect(pageSource).not.toContain("DEMO-QR");
  });

  it("uses semantic theme tokens instead of light-only receipt colors", () => {
    expect(pageSource).toContain("bg-card");
    expect(pageSource).toContain("bg-secondary/50");
    expect(pageSource).toContain("text-muted-foreground");
    expect(pageSource).toContain("border-border");
    for (const lightOnlyClass of [
      "bg-white",
      "bg-slate-50/70",
      "text-slate-500",
      "text-slate-400",
      "border-slate-100",
    ]) {
      expect(pageSource).not.toContain(lightOnlyClass);
    }
  });
});
