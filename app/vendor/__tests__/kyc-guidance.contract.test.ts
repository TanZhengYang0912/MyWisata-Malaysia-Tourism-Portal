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

  it("mounts the existing capability dialog provider for Vendor routes", () => {
    const layoutSource = read("app/vendor/layout.tsx");

    expect(layoutSource).toContain("CustomerCapabilityGateProvider");
    expect(layoutSource).toContain("<CustomerCapabilityGateProvider>");
  });

  it("checks KYC before both opening and submitting the withdrawal modal", () => {
    const walletSource = read("app/vendor/wallet/page.tsx");

    expect(walletSource).toContain("useCustomerCapabilityGateDialog");
    expect(walletSource).toContain("getVendorWithdrawalKycDecision");
    expect(walletSource).toContain("const { currentUser, verificationFacts } = useAuth()");
    expect(walletSource).toContain("function requireApprovedWithdrawalKyc()");
    expect(walletSource).toMatch(/function openWithdraw\(\)[\s\S]*requireApprovedWithdrawalKyc\(\)[\s\S]*setShowModal\(true\)/);
    expect(walletSource).toMatch(/async function handleWithdraw[\s\S]*requireApprovedWithdrawalKyc\(\)[\s\S]*requestWithdrawal/);
    expect(walletSource).toContain("onClick={openWithdraw}");
  });
});
