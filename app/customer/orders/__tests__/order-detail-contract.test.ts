import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/customer/orders/[id]/page.tsx"), "utf8");
const orderPassSource = readFileSync(resolve(process.cwd(), "app/customer/orders/[id]/order-pickup-qr-codes.tsx"), "utf8");

describe("customer order detail actions", () => {
  it("uses the shared real booking QR and keeps refund/print actions available", () => {
    expect(pageSource).toContain("OrderPickupQrCodes");
    expect(orderPassSource).toContain("BookingQrCode");
    expect(pageSource).toContain('tCustomer("ui.actions.requestRefund")');
    expect(pageSource).toContain('tCustomer("ui.actions.printReceipt")');
    expect(pageSource).not.toContain("Demo QR");
    expect(pageSource).not.toContain("b.qrCode");
  });

  it("uses locale keys instead of inline translation defaults", () => {
    expect(pageSource).not.toContain("defaultValue");
  });

  it("shows and copies the complete customer-facing order reference", () => {
    expect(pageSource).toContain("formatOrderReference(order.id, order.displayId)");
    expect(pageSource).not.toContain("shortOrderId(order.id)");
    expect(pageSource).toContain("navigator.clipboard.writeText(formatOrderReference(order.id, order.displayId))");
  });

  it("shows the checkout date for one-night accommodation items", () => {
    expect(pageSource).toContain('item.categorySlug === "accommodation"');
    expect(pageSource).toContain('booking.categorySlug === "accommodation"');
  });

  it("shows the guest preferences stored on an accommodation order", () => {
    expect(pageSource).toContain("item.stayDetails ?? order.stayDetails");
    expect(pageSource).toContain("details.primaryGuestName");
    expect(pageSource).toContain("details.additionalGuestNames");
    expect(pageSource).toContain("ui.property.arrivalLabels.${details.estimatedArrival}");
    expect(pageSource).toContain("details.specialRequest");
    expect(pageSource).toContain("order.stayDetails && order.items.some((item) => item.categorySlug === \"accommodation\")");
  });

  it("does not render an empty or invented variant label for a booking item", () => {
    expect(pageSource).toContain('item.variantLabel ? ` ${item.variantLabel}` : ""');
    expect(pageSource).toContain("item.variantLabel && <p");
  });

  it("presents each entry pass in a spacious responsive card with readable booking details", () => {
    const sharedCard = readFileSync(
      resolve(process.cwd(), "components/customer/customer-qr-pass-card.tsx"),
      "utf8",
    );
    expect(orderPassSource).toContain("CustomerQrPassCard");
    expect(sharedCard).toContain("sm:grid-cols-[minmax(0,1fr)_11rem]");
    expect(sharedCard).toContain("sm:w-44");
    expect(sharedCard.indexOf('data-qr-pass-details="true"')).toBeLessThan(
      sharedCard.indexOf('data-qr-pass-code="true"'),
    );
    expect(orderPassSource).toContain("ticket.slotLabel");
    expect(orderPassSource).toContain("outletLabel=");
    expect(orderPassSource).not.toContain("bookingReference");
  });

  it("explains pending payment and only renders provider resume actions after server verification", () => {
    expect(pageSource).toContain('data-payment-resume-panel="true"');
    expect(pageSource).toContain('tCustomer("ui.orders.pendingPaymentExplanation")');
    expect(pageSource).toContain('tCustomer("ui.orders.continuePayment")');
    expect(pageSource).toContain("handleContinuePayment");
    expect(pageSource).toContain("isTrustedPaymentRedirect(result.url)");
    expect(pageSource).toContain('tCustomer("ui.orders.paymentLinkExpired")');
    expect(pageSource).toContain('tCustomer("ui.orders.reviewCart")');
    expect(pageSource).toContain("handleReviewCart");
    expect(pageSource).not.toContain('text-foreground uppercase">{order.status}');
  });
});
