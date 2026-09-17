import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  const path = resolve(process.cwd(), relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("Vendor Wallet KYC guidance contract", () => {
  it("shares one KYC submission implementation between customer and vendor routes", () => {
    const sharedSource = read("components/kyc/kyc-submission-page.tsx");
    const customerRoute = read("app/customer/kyc/page.tsx");
    const vendorRoute = read("app/vendor/kyc/page.tsx");

    expect(sharedSource).toContain("export function KycSubmissionPage");
    expect(customerRoute).toContain('from "@/components/kyc/kyc-submission-page"');
    expect(customerRoute).toContain('selfPath="/customer/kyc"');
    expect(customerRoute).toContain('backHref="/customer/profile"');
    expect(vendorRoute).toContain('from "@/components/kyc/kyc-submission-page"');
    expect(vendorRoute).toContain('selfPath="/vendor/kyc"');
    expect(vendorRoute).toContain('backHref="/vendor/wallet"');
  });

  it("keeps the Vendor Wallet return label available in every maintained customer locale", () => {
    for (const locale of ["en", "ms", "zh-CN"]) {
      const messages = JSON.parse(read(`app/i18n/locales/${locale}/customer.json`)) as {
        ui?: { kyc?: { backToVendorWallet?: unknown } };
      };
      expect(messages.ui?.kyc?.backToVendorWallet, locale).toEqual(expect.any(String));
    }
  });
});
