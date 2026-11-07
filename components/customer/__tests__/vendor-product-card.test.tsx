import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OperatingHours } from "@/backend/core/types";
import type { VendorProductCardData } from "@/lib/customer/vendor-page";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count === undefined ? key : `${key}:${options.count}` }) }));
vi.mock("@/components/providers/wishlist", () => ({ useOptionalWishlist: () => null }));
vi.mock("@/components/customer/product-save-button", () => ({ ProductSaveButton: () => null }));
vi.mock("@/components/customer/localized-content", () => ({ LocalizedContent: ({ sourceText, children }: { sourceText: string; children?: (value: { text: string; control: null }) => React.ReactNode }) => children ? children({ text: sourceText, control: null }) : <span>{sourceText}</span> }));
vi.mock("@/components/customer/operating-hours-summary", () => ({ OperatingHoursSummary: () => <span>hours-summary</span> }));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR}</span> }));
import { ActivityCard } from "@/components/customer/activity-card";
import { toVendorCatalogueCard } from "@/lib/customer/product-catalogue";

const closedAllWeek: OperatingHours = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { closed: true }]));
const product: VendorProductCardData = {
  id: "p1", vendorId: "v1", name: "A local experience", description: null, productType: "activity",
  imageUrl: null, fromPrice: 12, requiresBooking: true, rating: 0, reviews: 0,
  soldAt: [{ id: "o1", name: "Outlet 1", price: 12, city: "Melaka", state: "Melaka", operatingHours: null }],
};

describe("vendor product cards", () => {
  it("keeps a single outlet in the booking link", () => {
    const markup = renderToStaticMarkup(<ActivityCard vendorListing={product} returnTo="/customer/vendor/v1" />);
    expect(markup).toContain("outletId=o1");
    expect(markup).toContain("ui.actions.bookNow");
  });
  it("leaves multiple outlets unselected and displays their count", () => {
    const markup = renderToStaticMarkup(<ActivityCard vendorListing={{ ...product, soldAt: [...product.soldAt, { ...product.soldAt[0], id: "o2" }] }} returnTo="/customer/vendor/v1" />);
    expect(markup).not.toContain("outletId=");
    expect(markup).toContain("ui.vendor.locationCount:2");
    expect(markup).toContain("RM12");
    expect(markup).not.toContain("0.0");
  });
  it("uses the same aggregate presentation while retaining home and vendor navigation modes", () => {
    const listing = toVendorCatalogueCard({ ...product, rating: 4.5, reviews: 7, soldAt: [...product.soldAt, { ...product.soldAt[0], id: 'o2', price: 5 }] });
    const home = renderToStaticMarkup(<ActivityCard listing={listing} source="home" returnTo="/customer" />);
    const vendor = renderToStaticMarkup(<ActivityCard listing={listing} source="vendor" returnTo="/customer/vendor/v1" />);
    for (const markup of [home, vendor]) {
      expect(markup).toContain('RM5');
      expect(markup).toContain('ui.vendor.locationCount:2');
      expect(markup).toContain('4.5');
      expect(markup).not.toContain('Melaka');
      expect(markup).not.toContain('outletId=');
    }
    expect(home).toContain('source=home');
    expect(vendor).toContain('source=vendor');
  });
  it("shows a single outlet's exact price and location count, but never its place, hours or Closed badge", () => {
    const markup = renderToStaticMarkup(<ActivityCard listing={toVendorCatalogueCard({ ...product, soldAt: [{ ...product.soldAt[0], operatingHours: closedAllWeek }] })} source="home" returnTo="/customer" />);
    expect(markup).toContain("RM12");
    expect(markup).not.toContain("ui.vendor.from");
    expect(markup).not.toContain("Melaka");
    expect(markup).not.toContain("hours-summary");
    expect(markup).not.toContain("ui.labels.closed");
    expect(markup).toContain("ui.vendor.locationCount:1");
    expect(markup).toContain("outletId=o1");
  });
  it("never presents one branch's place, hours or Closed badge as a multi-outlet product's", () => {
    const closedOutlet = { ...product.soldAt[0], operatingHours: closedAllWeek };
    const markup = renderToStaticMarkup(<ActivityCard listing={toVendorCatalogueCard({ ...product, soldAt: [closedOutlet, { ...closedOutlet, id: "o2", price: 8 }] })} source="home" returnTo="/customer" />);
    expect(markup).toContain("ui.vendor.from");
    expect(markup).toContain("RM8");
    expect(markup).not.toContain("Melaka");
    expect(markup).not.toContain("hours-summary");
    expect(markup).not.toContain("ui.labels.closed");
  });
  it("labels paid and merchant-featured discovery cards, alone or together", () => {
    const base = toVendorCatalogueCard(product);
    const render = (flags: { sponsored?: boolean; featured?: boolean }) => renderToStaticMarkup(<ActivityCard listing={{ ...base, ...flags }} returnTo="/customer/explore" />);
    expect(render({ sponsored: true })).toContain("ui.labels.sponsored");
    expect(render({ sponsored: true })).not.toContain("ui.labels.featured");
    expect(render({ featured: true })).toContain("ui.labels.featured");
    const both = render({ sponsored: true, featured: true });
    expect(both.indexOf("ui.labels.sponsored")).toBeGreaterThan(-1);
    expect(both.indexOf("ui.labels.featured")).toBeGreaterThan(both.indexOf("ui.labels.sponsored"));
  });
  it("keeps vendor-page cards free of Sponsored and Featured labels", () => {
    const markup = renderToStaticMarkup(<ActivityCard vendorListing={product} returnTo="/customer/vendors/v1" />);
    expect(markup).not.toContain("ui.labels.sponsored");
    expect(markup).not.toContain("ui.labels.featured");
  });
  it("shows open-now counts beside the location count and links to the open outlet", () => {
    const listing = { ...toVendorCatalogueCard({ ...product, soldAt: [...product.soldAt, { ...product.soldAt[0], id: "o2" }] }), openNowSummary: { totalOutletCount: 4, openOutletCount: 2 }, pinnedOutletId: "o2" };
    const markup = renderToStaticMarkup(<ActivityCard listing={listing} returnTo="/customer/explore" />);
    expect(markup).toContain("ui.vendor.locationCount:4");
    expect(markup).toContain("ui.vendor.openNowCount:2");
    expect(markup).toContain("outletId=o2");
  });
  it("translates known product types through the discovery category labels", () => {
    const markup = renderToStaticMarkup(<ActivityCard listing={toVendorCatalogueCard({ ...product, productType: "food" })} source="home" returnTo="/customer" />);
    expect(markup).toContain("categories.food");
    expect(markup).not.toContain("Food &amp; drink");
  });
});
