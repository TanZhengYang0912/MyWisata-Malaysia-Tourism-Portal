import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => {
  const path = resolve(process.cwd(), file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

const dialogSource = read("components/customer/refund-request-dialog.tsx");
const orderSource = read("app/customer/orders/[id]/page.tsx");
const bookingSource = read("app/customer/bookings/[id]/page.tsx");

describe("shared customer refund request dialog", () => {
  it("owns the consistent customer refund form and reason options", () => {
    expect(dialogSource).toContain("export function RefundRequestDialog");
    expect(dialogSource).toContain("requestRefundModalTitle");
    expect(dialogSource).toContain("refundReasonSchedule");
    expect(dialogSource).toContain("refundDetailsPlaceholder");
    expect(dialogSource).toContain("refundPolicyNotice");
    expect(dialogSource).toContain("onConfirm");
  });

  it("is reused by order and booking details instead of native prompt", () => {
    expect(orderSource).toContain("RefundRequestDialog");
    expect(bookingSource).toContain("RefundRequestDialog");
    expect(bookingSource).toContain("setRefundModalOpen(false)");
    expect(bookingSource).not.toContain("window.prompt");
    expect(bookingSource).not.toContain("prompt(");
  });
});
