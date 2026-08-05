import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(process.cwd(), "app/api/share-image/[type]/[id]/route.tsx"), "utf8");

describe("vendor share image contract", () => {
  it("does not return untrusted vendor cover media", () => {
    expect(routeSource).toContain("getVendorVisual");
    expect(routeSource).toContain("coverUrl: vendorVisual.coverUrl");
    expect(routeSource).not.toContain("return { name: vendor.name, coverUrl: vendor.cover_url");
  });
});
