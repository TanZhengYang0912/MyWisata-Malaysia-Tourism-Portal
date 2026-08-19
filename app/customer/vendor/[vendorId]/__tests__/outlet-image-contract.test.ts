import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/customer/vendor/[vendorId]/page.tsx"), "utf8");

describe("customer vendor outlet image contract", () => {
  it("loads outlet hero imagery and uses it in outlet cards", () => {
    expect(pageSource).toContain("outlet_pages(hero_url)");
    expect(pageSource).toContain("resolveOutletImage");
    expect(pageSource).toContain("managed_by_vendor_id");
    expect(pageSource).toContain("location.coverUrl ? <img");
  });

  it("keeps a real outlet identity fallback when no hero image exists", () => {
    expect(pageSource).toContain("{visual.initials}");
    expect(pageSource).toContain("t('ui.vendor.outletIdentity')");
  });
});
