import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer QR pass card contract", () => {
  it("uses one shared card for food fulfilment and admission tickets", () => {
    expect(read("components/customer/food-order-qr-codes.tsx")).toContain("<CustomerQrPassCard");
    expect(read("app/customer/orders/[id]/order-pickup-qr-codes.tsx")).toContain("<CustomerQrPassCard");
    expect(read("app/customer/bookings/[id]/page.tsx")).toContain("<CustomerQrPassCard");
  });

  it("keeps provider labels only where the pass title is not the merchant", () => {
    const foodPasses = read("components/customer/food-order-qr-codes.tsx");
    const ticketQr = read("components/customer/booking-qr-code.tsx");
    const orderPickupQr = read("app/customer/orders/[id]/order-pickup-qr-codes.tsx");
    const bookingDetails = read("app/customer/bookings/[id]/page.tsx");

    expect(foodPasses).not.toContain('t("ui.labels.providedBy", { vendor: pass.vendorName })');
    expect(foodPasses).not.toContain("ui.booking.foodOrderQrDescription");
    expect(foodPasses).not.toContain("ui.booking.takeawayScanHint");
    expect(foodPasses).not.toContain("ui.booking.dineInScanHint");
    expect(foodPasses).not.toContain('t("ui.labels.vendor")');
    expect(ticketQr).not.toContain('t("ui.labels.vendor")');
    expect(orderPickupQr).toContain('t("ui.labels.providedBy", { vendor: ticket.vendorName })');
    expect(orderPickupQr).toContain('t("ui.labels.outlet")');
    expect(bookingDetails).toContain('tCustomer("ui.labels.providedBy",');
    expect(bookingDetails).toContain('tCustomer("ui.labels.outlet")');
  });

  it("limits the stacked mobile layout to consumers that opt in", () => {
    const card = read("components/customer/customer-qr-pass-card.tsx");
    const bookingDetails = read("app/customer/bookings/[id]/page.tsx");
    const orderPickupQr = read("app/customer/orders/[id]/order-pickup-qr-codes.tsx");
    const foodPasses = read("components/customer/food-order-qr-codes.tsx");

    expect(card).toContain('data-qr-pass-card="true"');
    expect(card).toContain('data-qr-pass-details="true"');
    expect(card).toContain('data-qr-pass-code="true"');
    expect(card).toContain('mobileStacked ? "grid-cols-1 p-4 sm:grid-cols-[minmax(0,1fr)_11rem]"');
    expect(card).toContain('"grid-cols-[minmax(0,1fr)_7rem] p-4 sm:grid-cols-[minmax(0,1fr)_11rem]"');
    expect(card).toContain("sm:grid-cols-[minmax(0,1fr)_11rem]");
    expect(card).toContain("max-w-60");
    expect(card).toContain("sm:justify-self-end");
    expect(bookingDetails).toContain("mobileStacked");
    expect(orderPickupQr).toContain("mobileStacked");
    expect(foodPasses).toContain("mobileStacked");
    expect(card.indexOf('data-qr-pass-details="true"')).toBeLessThan(card.indexOf('data-qr-pass-code="true"'));
  });
});
