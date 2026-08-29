import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = resolve(process.cwd(), "app/customer/phone/page.tsx");
const cardPath = resolve(process.cwd(), "components/profile/phone-verification-card.tsx");
const pageSource = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : "";
const cardSource = existsSync(cardPath) ? readFileSync(cardPath, "utf8") : "";

describe("independent phone verification page contract", () => {
  it("uses the customer skeleton and extracted OTP card", () => {
    expect(pageSource).toContain("CustomerPageTitle");
    expect(pageSource).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
    expect(pageSource).toContain("<PhoneVerificationCard");
    expect(cardSource).toContain('fetch("/api/phone/send-otp"');
    expect(cardSource).toContain('fetch("/api/phone/verify-otp"');
    expect(cardSource).toContain("<InternationalPhoneInput");
  });

  it("refreshes the trusted auth snapshot and only returns to a safe next path", () => {
    expect(pageSource).toContain("postLoginPath(searchParams.get(\"next\"))");
    expect(pageSource).toContain("await refreshUser()");
    expect(pageSource).toContain("router.push(continuation)");
    expect(pageSource).not.toContain("window.location");
  });
});
