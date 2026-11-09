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

const homePageSource = readFileSync(resolve(process.cwd(), "app/customer/page.tsx"), "utf8");
const directoryPageSource = readFileSync(resolve(process.cwd(), "app/customer/partners/page.tsx"), "utf8");

describe("customer vendor card reuse", () => {
  it("tells no reviews (null) apart from a failed rating lookup (undefined)", () => {
    for (const source of [homePageSource, directoryPageSource]) {
      expect(source).toContain(".catch(() => null)");
      expect(source).toContain("?? null : undefined");
    }
  });

  it("uses one shared vendor card in Home and Partners", () => {
    expect(homeSource).toContain('from "@/components/customer/vendor-card"');
    expect(partnersSource).toContain('from "@/components/customer/vendor-card"');
    expect(homeSource).toContain("<VendorCard");
    expect(partnersSource).toContain("<VendorCard");
    expect(partnersSource).not.toContain("function VendorDirectoryCard");
  });

  it("keeps featured ranking on Partners but shows no Featured label on the card", () => {
    expect(sharedCardSource).not.toContain("isFeatured");
    expect(sharedCardSource).not.toContain("PhotoCardLabels");
    expect(partnersSource).toContain("featuredVendorIds");
    expect(partnersSource).toContain("rankPartnerDirectory");
  });

  it("uses the shared CardFrame with locations and open state, and no description, distance or drawer", () => {
    expect(sharedCardSource).toContain("<CardFrame");
    expect(sharedCardSource).toContain("<CardLocationStatus");
    expect(sharedCardSource).not.toContain("ExpandCard");
    expect(sharedCardSource).not.toContain("distanceLabel");
    expect(sharedCardSource).not.toContain("description={");
    expect(homeSource).not.toContain("distanceLabel=");
    expect(homeSource).not.toContain("detailsRevealStyle");
    expect(partnersSource).not.toContain("detailsRevealStyle");
  });
});
