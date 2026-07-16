import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Profile completion phone step", () => {
  it("uses the shared field and canonical phone values for OTP requests", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/customer/profile/page.tsx"),
      "utf8",
    );

    expect(source).toContain("InternationalPhoneInput");
    expect(source).toContain("parseInternationalPhone(phone)");
    expect(source).not.toContain('placeholder="+60123456789"');
  });

  it("uses the shared field and canonical phone values in Change phone", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/profile/profile-sections.tsx"),
      "utf8",
    );

    expect(source).toContain("InternationalPhoneInput");
    expect(source).toContain("parseInternationalPhone(phone)");
    expect(source).not.toContain('placeholder="+60123456789"');
  });
});
