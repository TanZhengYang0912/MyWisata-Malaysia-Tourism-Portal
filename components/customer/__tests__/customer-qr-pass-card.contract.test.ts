import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer QR pass card contract", () => {
  it("uses one shared card for food fulfilment and admission tickets", () => {
    expect(read("components/customer/food-order-qr-codes.tsx")).toContain("<CustomerQrPassCard");
    expect(read("app/customer/orders/[id]/page.tsx")).toContain("<CustomerQrPassCard");
    expect(read("app/customer/bookings/[id]/page.tsx")).toContain("<CustomerQrPassCard");
  });

  it("keeps merchant identity in translated card details, not beside the QR as a raw key", () => {
    const foodPasses = read("components/customer/food-order-qr-codes.tsx");
    const ticketQr = read("components/customer/booking-qr-code.tsx");
    const orderDetails = read("app/customer/orders/[id]/page.tsx");
    const bookingDetails = read("app/customer/bookings/[id]/page.tsx");

    expect(foodPasses).toContain('t("ui.labels.providedBy", { vendor: pass.vendorName })');
    expect(foodPasses).not.toContain('t("ui.labels.vendor")');
    expect(ticketQr).not.toContain('t("ui.labels.vendor")');
    expect(orderDetails).toContain('tCustomer("ui.labels.providedBy",');
    expect(orderDetails).toContain('tCustomer("ui.labels.outlet")');
    expect(bookingDetails).toContain('tCustomer("ui.labels.providedBy",');
    expect(bookingDetails).toContain('tCustomer("ui.labels.outlet")');
  });

  it("provides a stable details column followed by a right-hand QR column", () => {
    const card = read("components/customer/customer-qr-pass-card.tsx");

    expect(card).toContain('data-qr-pass-card="true"');
    expect(card).toContain('data-qr-pass-details="true"');
    expect(card).toContain('data-qr-pass-code="true"');
    expect(card).toContain("grid-cols-[minmax(0,1fr)_8rem]");
    expect(card).toContain("sm:grid-cols-[minmax(0,1fr)_11rem]");
    expect(card.indexOf('data-qr-pass-details="true"')).toBeLessThan(card.indexOf('data-qr-pass-code="true"'));
  });
});
