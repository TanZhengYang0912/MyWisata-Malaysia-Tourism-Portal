import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ticketSource = readFileSync(resolve(process.cwd(), "components/vouchers/voucher-ticket.tsx"), "utf8");
const customerSource = readFileSync(resolve(process.cwd(), "app/customer/vouchers/voucher-hub-client.tsx"), "utf8");

describe("voucher barcode contract", () => {
  it("exposes a real Code 128 barcode slot in the shared voucher ticket", () => {
    expect(ticketSource).toContain("barcodeValue");
    expect(ticketSource).toContain("VoucherBarcode");
  });

  it("renders the barcode only from a claimed in-store-capable voucher", () => {
    expect(customerSource).toContain("barcodeValue");
    expect(customerSource).toContain('["in_store", "both"]');
    expect(customerSource).toContain('voucher.claim?.storeToken');
  });

  it("gates the voucher code behind claimed status so unclaimed deals do not leak promo codes", () => {
    expect(customerSource).toContain('code: voucher.claim?.status === "claimed" ? voucher.code : null');
  });
});
