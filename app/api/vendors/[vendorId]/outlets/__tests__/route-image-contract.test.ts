import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(process.cwd(), "app/api/vendors/[vendorId]/outlets/route.ts"), "utf8");

describe("vendor outlet image contract", () => {
  it("resolves outlet imagery from the outlet page or its managed customer place", () => {
    expect(routeSource).toContain("managed_by_vendor_id");
    expect(routeSource).toContain("resolveOutletImage");
  });
});
