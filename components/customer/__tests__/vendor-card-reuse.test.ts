import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sharedCardSource = readFileSync(
  resolve(process.cwd(), "components/customer/vendor-card.tsx"),
  "utf8",
);
const homeSource = readFileSync(
  resolve(process.cwd(), "app/customer/customer-home-client.tsx"),
  "utf8",
);
const partnersSource = readFileSync(
  resolve(process.cwd(), "app/customer/search/search-client.tsx"),
  "utf8",
);

describe("customer vendor card reuse", () => {
  it("uses one shared vendor card in Home and Partners", () => {
    expect(homeSource).toContain('from "@/components/customer/vendor-card"');
    expect(partnersSource).toContain('from "@/components/customer/vendor-card"');
    expect(homeSource).toContain("<VendorCard");
    expect(partnersSource).toContain("<VendorCard");
    expect(partnersSource).not.toContain("function VendorDirectoryCard");
  });

  it("uses the verified partner badge consistently and keeps featured ranking separate", () => {
    expect(sharedCardSource).toContain("isFeatured?: boolean");
    expect(sharedCardSource).toContain('t("ui.search.verifiedLocalPartner")');
    expect(sharedCardSource).toContain('t("ui.search.featuredPartner")');
    expect(partnersSource).toContain("featuredVendorIds");
    expect(partnersSource).toContain("rankPartnerDirectory");
    expect(partnersSource).toContain("isFeatured={featuredVendorIds.has(vendor.id)}");
  });
});
