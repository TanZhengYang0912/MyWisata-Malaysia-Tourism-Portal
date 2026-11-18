import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/customer/vendor/[vendorId]/page.tsx"), "utf8");
// The vendor page's rows are read in the shared public cache.
const cacheSource = readFileSync(resolve(process.cwd(), "lib/cache/catalogue-cache.ts"), "utf8");

describe("customer vendor outlet image contract", () => {
  it("loads outlet hero imagery and uses it in outlet cards", () => {
    expect(cacheSource).toContain("outlet_pages(hero_url)");
    expect(pageSource).toContain("resolveOutletImage");
    expect(cacheSource).toContain("managed_by_vendor_id");
  });
});
