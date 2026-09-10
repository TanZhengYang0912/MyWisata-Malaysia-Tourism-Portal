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

  it("sends the OTP when Enter is pressed in the phone number field", () => {
    expect(cardSource).toContain("function handlePhoneKeyDown");
    expect(cardSource).toContain('if (event.key !== "Enter") return;');
    expect(cardSource).toContain("event.preventDefault()");
    expect(cardSource).toContain("void sendOtp()");
    expect(cardSource).toContain("onKeyDown={handlePhoneKeyDown}");
  });

  it("focuses the OTP field and verifies it when Enter is pressed", () => {
    expect(cardSource).toContain("function handleOtpKeyDown");
    expect(cardSource).toContain("void verifyOtp()");
    expect(cardSource).toMatch(
      /id="verification-otp"[\s\S]*?disabled=\{busy\}[\s\S]*?autoFocus[\s\S]*?onKeyDown=\{handleOtpKeyDown\}/,
    );
  });
});
