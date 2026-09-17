import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = (path: string) => readFileSync(new URL(
  path === "../kyc/page.tsx" ? "../../../components/kyc/kyc-submission-page.tsx" : path,
  import.meta.url,
), "utf8");

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
    expect(source).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
  });

  it.each([
    "../affiliate/page.tsx",
    "../profile/register-vendor/page.tsx",
    "../recommendations/page.tsx",
  ])("uses the shared title grid in %s", (path) => {
    const source = page(path);
    expect(source).toContain("CustomerPageTitle");
    expect(source).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
  });

  it("aligns both Become a Vendor states", () => {
    const source = page("../profile/register-vendor/page.tsx");
    expect(source.match(/<CustomerPageTitle/g) ?? []).toHaveLength(2);
  });

  it("keeps the customer KYC route as a thin wrapper around the shared aligned page", () => {
    const route = readFileSync(new URL("../kyc/page.tsx", import.meta.url), "utf8");
    expect(route).toContain('from "@/components/kyc/kyc-submission-page"');
  });

  it.each(["../calendar/page.tsx", "../orders/page.tsx"])(
    "uses the shared two-anchor layout in %s",
    (path) => {
      const source = page(path);
      expect(source).toContain("CustomerPageTitle");
      expect(source).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
    },
  );

  it("keeps My Vouchers outside the shared account title layout", () => {
    const source = page("../vouchers/voucher-hub-client.tsx");
    expect(source).not.toContain("CustomerPageTitle");
  });
});
