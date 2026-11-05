import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VendorProductCardData } from "@/lib/customer/vendor-page";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count === undefined ? key : `${key}:${options.count}` }) }));
vi.mock("@/components/providers/wishlist", () => ({ useOptionalWishlist: () => null }));
vi.mock("@/components/customer/product-save-button", () => ({ ProductSaveButton: () => null }));
vi.mock("@/components/customer/localized-content", () => ({ LocalizedContent: ({ sourceText, children }: { sourceText: string; children?: (value: { text: string; control: null }) => React.ReactNode }) => children ? children({ text: sourceText, control: null }) : <span>{sourceText}</span> }));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR}</span> }));
import { ActivityCard } from "@/components/customer/activity-card";

const product: VendorProductCardData = {
  id: "p1", vendorId: "v1", name: "A local experience", description: null, productType: "activity",
  imageUrl: null, fromPrice: 12, requiresBooking: true, rating: 0, reviews: 0,
  soldAt: [{ id: "o1", name: "Outlet 1", price: 12, city: "Melaka", state: "Melaka", operatingHours: null }],
};

describe("vendor product cards", () => {
  it("keeps a single outlet in the booking link", () => {
    const markup = renderToStaticMarkup(<ActivityCard vendorListing={product} returnTo="/customer/vendor/v1" />);
    expect(markup).toContain("outletId=o1");
    expect(markup).toContain("Melaka");
    expect(markup).toContain("ui.actions.bookNow");
  });
  it("leaves multiple outlets unselected and displays their count", () => {
    const markup = renderToStaticMarkup(<ActivityCard vendorListing={{ ...product, soldAt: [...product.soldAt, { ...product.soldAt[0], id: "o2" }] }} returnTo="/customer/vendor/v1" />);
    expect(markup).not.toContain("outletId=");
    expect(markup).toContain("ui.vendor.locationCount:2");
    expect(markup).toContain("RM12");
    expect(markup).not.toContain("0.0");
  });
});
