import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("customer account page alignment", () => {
  it.each([
    "../notifications/page.tsx",
    "../preferences/page.tsx",
    "../wallet/page.tsx",
    "../kyc/page.tsx",
    "../support/page.tsx",
  ])("splits the wide title from the narrow body in %s", (path) => {
    const source = page(path);
    expect(source).toContain("CustomerPageTitle");
    expect(source).toContain('CustomerPageShell className="pt-0 sm:pt-0"');
  });

  it.each([
    "../affiliate/page.tsx",
    "../profile/register-vendor/page.tsx",
    "../recommendations/page.tsx",
  ])("uses the shared title grid in %s", (path) => {
    const source = page(path);
    expect(source).toContain("CustomerPageTitle");
    expect(source).toContain('CustomerPageShell className="pt-0 sm:pt-0"');
  });

  it("aligns both Become a Vendor states", () => {
    const source = page("../profile/register-vendor/page.tsx");
    expect(source.match(/<CustomerPageTitle/g) ?? []).toHaveLength(2);
  });
});
