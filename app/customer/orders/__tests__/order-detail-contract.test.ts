import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/customer/orders/[id]/page.tsx"), "utf8");

describe("customer order detail actions", () => {
  it("uses the shared real booking QR and keeps refund/print actions available", () => {
    expect(pageSource).toContain("BookingQrCode");
    expect(pageSource).toContain('tCustomer("ui.actions.requestRefund")');
    expect(pageSource).toContain('tCustomer("ui.actions.printReceipt")');
    expect(pageSource).not.toContain("Demo QR");
    expect(pageSource).not.toContain("b.qrCode");
  });

  it("uses locale keys instead of inline translation defaults", () => {
    expect(pageSource).not.toContain("defaultValue");
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
    expect(pageSource).toContain("CustomerQrPassCard");
    expect(sharedCard).toContain("sm:grid-cols-[minmax(0,1fr)_11rem]");
    expect(sharedCard).toContain("sm:w-44");
    expect(sharedCard.indexOf('data-qr-pass-details="true"')).toBeLessThan(
      sharedCard.indexOf('data-qr-pass-code="true"'),
    );
    expect(pageSource).toContain("dateTimeLabel(b.slotStartsAt, locale)");
    expect(pageSource).toContain('tCustomer("ui.labels.bookingReference")');
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
