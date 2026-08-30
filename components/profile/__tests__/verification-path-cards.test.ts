import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = resolve(process.cwd(), "components/profile/verification-path-cards.tsx");
const source = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";

describe("VerificationPathCards contract", () => {
  it("renders only the independent Phone and KYC destinations", () => {
    expect(source).toContain("export function VerificationPathCards");
    expect(source).toContain('href: "/customer/phone"');
    expect(source).toContain('href: "/customer/kyc"');
    expect(source).not.toContain('href: "/customer/profile"');
    expect(source).not.toContain("INTENTS");
  });

  it("uses a compact responsive two-card row and existing status copy", () => {
    expect(source).toContain("grid gap-3 sm:grid-cols-2");
    expect(source).toContain("phoneVerified");
    expect(source).toContain("kycStatus");
    expect(source).toContain('kycStatus === "approved"');
    expect(source).toContain('kycStatus === "pending"');
    expect(source).toContain('kycStatus === "rejected"');
    expect(source).toContain("ui.accountVerification.statuses.states");
    expect(source).toContain("CheckCircle2");
    expect(source).toContain("Circle");
  });

  it("keeps the row visually unheaded but accessible", () => {
    expect(source).toContain('aria-label={tCustomer("ui.accountVerification.statuses.title")}');
    expect(source).not.toContain("<h2");
    expect(source).not.toContain("statuses.description");
  });
});
