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
});
