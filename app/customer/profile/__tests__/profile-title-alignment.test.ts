import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

describe("profile title alignment", () => {
  it("aligns both profile title states with the customer navigation without widening the body", () => {
    expect(source).toContain("CustomerPageTitle");
    expect(source).not.toContain("function ProfilePageTitle");
    expect(source.match(/<CustomerPageTitle/g) ?? []).toHaveLength(2);
    expect(source).toContain('<CustomerPageShell className="pt-0 pb-0 sm:pt-0">');
    expect(source).toContain('<CustomerPageShell className="pt-0 sm:pt-0">');
  });
});
