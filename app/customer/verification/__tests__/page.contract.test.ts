import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = resolve(process.cwd(), "app/customer/verification/page.tsx");
const bannerPath = resolve(process.cwd(), "components/profile/business-share-banner.tsx");
const pageSource = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : "";
const bannerSource = existsSync(bannerPath) ? readFileSync(bannerPath, "utf8") : "";

describe("account verification page contract", () => {
  it("uses the shared customer shell and exact reusable business banner", () => {
    expect(pageSource).toContain("CustomerPageTitle");
    expect(pageSource).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
    expect(pageSource).toContain("<BusinessShareBanner");
    expect(bannerSource).toContain('href="/customer/profile/register-vendor"');
    expect(bannerSource).toContain('rounded-2xl border border-primary/15 bg-primary/[0.04]');
    expect(bannerSource).toContain('tCustomer("ui.profileWizard.businessPrompt")');
    expect(bannerSource).toContain('tCustomer("ui.profileWizard.businessDescription")');
  });

  it("presents capability-first intents with independent qualification paths", () => {
    expect(pageSource).toContain('capability: "commerce.checkout"');
    expect(pageSource).toContain('capability: "recommendation.submit"');
    expect(pageSource).toContain('capability: "affiliate.full"');
    expect(pageSource).toContain('capability: "wallet.request_withdrawal"');
    expect(pageSource).toContain('href: "/customer/phone"');
    expect(pageSource).toContain('href: "/customer/profile"');
    expect(pageSource).toContain('href: "/customer/kyc"');
    expect(pageSource).not.toMatch(/Step\s*[123]/);
  });

  it("renders Phone, Profile, and KYC as independent statuses", () => {
    expect(pageSource).toContain("verificationFacts.phoneVerified");
    expect(pageSource).toContain("verificationFacts.profileComplete");
    expect(pageSource).toContain("verificationFacts.kycStatus");
    expect(pageSource).toContain('tCustomer("ui.accountVerification.statuses.title")');
  });
});
