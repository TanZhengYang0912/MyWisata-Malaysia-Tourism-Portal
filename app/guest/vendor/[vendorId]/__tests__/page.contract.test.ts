import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/guest/vendor/[vendorId]/page.tsx"), "utf8");

describe("guest vendor image contract", () => {
  it("filters vendor cover media before rendering or creating metadata", () => {
    expect(pageSource).toContain("getVendorVisual");
    expect(pageSource).toContain("vendorVisual.coverUrl");
    expect(pageSource).not.toContain("images: vendor.cover_url ?");
    expect(pageSource).not.toContain("<img src={vendor.cover_url}");
  });
});
