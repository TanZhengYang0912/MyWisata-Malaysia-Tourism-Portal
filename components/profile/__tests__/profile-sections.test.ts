import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("completed Profile location integration", () => {
  it("reuses the shared location fields and submits canonical metadata", () => {
    const source = readFileSync(resolve(process.cwd(), "components/profile/profile-sections.tsx"), "utf8");
    expect(source).toContain('import { ProfileLocationFields }');
    expect(source).toContain("<ProfileLocationFields");
    expect(source).toContain("cityId");
    expect(source).toContain("countryCode");
    expect(source).not.toMatch(/<input value=\{city\}[^>]+cityPlaceholder/);
  });
});
