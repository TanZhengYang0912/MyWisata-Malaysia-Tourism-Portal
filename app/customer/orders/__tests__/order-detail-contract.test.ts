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
    expect(pageSource).toContain("sm:grid-cols-[minmax(0,1fr)_220px]");
    expect(pageSource).toContain("sm:col-start-2");
    expect(pageSource).toContain("size={176}");
    expect(pageSource).toContain('className="flex min-w-0 flex-col gap-1 border-t border-border pt-4"');
    expect(pageSource).toContain("dateTimeLabel(b.slotStartsAt, locale)");
    expect(pageSource).toContain('tCustomer("ui.labels.bookingReference")');
    expect(pageSource).not.toContain("min-h-24 w-24");
  });
});
