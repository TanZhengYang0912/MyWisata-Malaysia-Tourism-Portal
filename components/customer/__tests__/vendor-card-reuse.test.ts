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

  it("labels featured partners with the shared photo label and keeps featured ranking separate", () => {
    expect(sharedCardSource).toContain("isFeatured?: boolean");
    expect(sharedCardSource).toContain("<PhotoCardLabels featured={isFeatured} />");
    expect(partnersSource).toContain("featuredVendorIds");
    expect(partnersSource).toContain("rankPartnerDirectory");
    expect(partnersSource).toContain("isFeatured={featuredVendorIds.has(vendor.id)}");
  });

  it("reveals Partners vendor details in the shared ExpandCard drawer", () => {
    expect(homeSource).not.toContain("detailsRevealOnHover");
    expect(partnersSource).not.toContain("detailsRevealOnHover");
    const details = sharedCardSource.slice(sharedCardSource.indexOf("details={<>"), sharedCardSource.indexOf("detailsId="));
    expect(sharedCardSource).toContain("<ExpandCard");
    expect(details).toContain("MapPin");
    expect(details).toContain("{location}");
  });

  it("uses the shared ExpandCard on Home and Partners and keeps Explore vendor as the action", () => {
    expect(sharedCardSource).toContain('import { ExpandCard } from "@/components/customer/expand-card"');
    expect(sharedCardSource).not.toContain("CardMediaHoverCaption");
    expect(sharedCardSource).not.toContain("detailsRevealStyle");
    expect(sharedCardSource).toContain('action={{ href: vendorHref, label: t("ui.actions.exploreVendor") }}');
    expect(homeSource).not.toContain("detailsRevealStyle");
    expect(partnersSource).not.toContain("detailsRevealStyle");
  });

  it("can show a nearby distance next to the outlet area in the drawer", () => {
    const details = sharedCardSource.slice(sharedCardSource.indexOf("details={<>"), sharedCardSource.indexOf("detailsId="));
    expect(sharedCardSource).toContain("distanceLabel?: string");
    expect(details).toContain("distanceLabel");
  });
});
