import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/bookings/[id]/page.tsx"),
  "utf8",
);

describe("customer booking details", () => {
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
    expect(pageSource).toContain('tCustomer("ui.actions.viewDetails")');
    expect(pageSource).toContain("/customer/orders/${booking.orderId}");
    expect(pageSource.match(/ui\.actions\.backToCalendar/g)).toHaveLength(1);
    expect(pageSource).not.toContain("booking.qrCode");
    expect(pageSource).not.toContain("DEMO-QR");
  });
});
