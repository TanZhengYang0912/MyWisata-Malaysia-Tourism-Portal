import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InternationalPhoneInput", () => {
  it("uses the international field with Malaysia as the default country", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/profile/international-phone-input.tsx"),
      "utf8",
    );

    expect(source).toContain("react-international-phone");
    expect(source).toContain('defaultCountry: "my"');
    expect(source).toContain('autoComplete="tel"');
    expect(source).toContain('placeholder="Search country or dial code"');
    expect(source).toContain("usePhoneInput");
  });
});
