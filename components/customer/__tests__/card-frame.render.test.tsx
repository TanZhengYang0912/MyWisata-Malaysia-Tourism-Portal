import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VendorProductCardData } from "@/lib/customer/vendor-page";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count === undefined ? key : `${key}:${options.count}` }) }));
vi.mock("@/components/providers/wishlist", () => ({
  useOptionalWishlist: () => ({}),
  useWishlist: () => ({ savedIds: new Set<string>(), savedOutletIds: new Set<string>(), toggleSaved: vi.fn(), toggleSavedOutlet: vi.fn() }),
}));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => () => true }));
vi.mock("@/components/customer/product-save-button", () => ({ ProductSaveButton: () => <button type="button" data-save>Save</button> }));
vi.mock("@/components/shared/share-button", () => ({ ShareButton: ({ shareType }: { shareType: string }) => <button type="button" data-share={shareType}>Share</button> }));
vi.mock("@/components/customer/localized-content", () => ({ LocalizedContent: ({ sourceText, children }: { sourceText: string; children?: (value: { text: string; control: null }) => React.ReactNode }) => children ? children({ text: sourceText, control: null }) : <span>{sourceText}</span> }));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR}</span> }));

import { ProductCard } from "@/components/customer/product-card";
import { VendorCard } from "@/components/customer/vendor-card";
import { OutletCard } from "@/components/customer/outlet-card";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";
import { toVendorCatalogueCard } from "@/lib/customer/product-catalogue";
import { SeeMoreLink } from "@/components/customer/see-more-link";

const product: VendorProductCardData = {
  id: "p1", vendorId: "v1", name: "Mossy Forest Guided Walk", description: null, productType: "activity",
  imageUrl: null, fromPrice: 80, requiresBooking: true, rating: 4.8, reviews: 12,
  soldAt: [{ id: "o1", name: "Outlet 1", price: 80, city: "Brinchang", state: "Pahang", operatingHours: null }],
};

/** The stretched link holds only the title; save and share sit outside it, so they never navigate. */
function linkOf(markup: string) {
  const links = markup.match(/<a [^>]*>[\s\S]*?<\/a>/g) ?? [];
  expect(links).toHaveLength(1);
  return links[0];
}

describe("ProductCard on the shared CardFrame", () => {
  it("links the whole card through the title, with save and share above the link", () => {
    const markup = renderToStaticMarkup(<ProductCard vendorListing={product} vendorName="Highlands Guides" returnTo="/customer/vendor/v1" />);
    const link = linkOf(markup);
    expect(link).toContain('data-card-link=""');
    expect(link).toContain("after:absolute after:inset-0");
    expect(link).not.toContain("data-save");
    expect(link).not.toContain("data-share");
    expect(markup).toContain("data-save");
    expect(markup).toContain('data-share="product"');
    expect(markup).toContain("z-20");
  });

  it("shows Type · Vendor, a two-line title, the rating on the photo and the single outlet's place", () => {
    const markup = renderToStaticMarkup(<ProductCard vendorListing={product} vendorName="Highlands Guides" returnTo="/customer/vendor/v1" />);
    expect(markup).toContain("categories.activity · Highlands Guides");
    expect(markup).toContain("line-clamp-2 h-[2.7em]");
    expect(markup).toContain('data-slot="photo-rating-badge"');
    expect(markup).toContain("Brinchang, Pahang");
    expect(markup).toContain("outletId=o1");
  });

  it("says From only when several outlets sell it, and never per person", () => {
    const single = renderToStaticMarkup(<ProductCard vendorListing={product} returnTo="/customer" />);
    const multi = renderToStaticMarkup(<ProductCard vendorListing={{ ...product, soldAt: [...product.soldAt, { ...product.soldAt[0], id: "o2", price: 60 }] }} returnTo="/customer" />);
    expect(single).not.toContain("ui.vendor.from");
    expect(multi).toContain("ui.vendor.from");
    expect(multi).toContain("RM60");
    expect(multi).toContain("ui.vendor.locationCount:2");
    expect(multi).not.toContain("outletId=");
    for (const markup of [single, multi]) expect(markup).not.toContain("ui.labels.person");
  });

  it("offers no Book or Buy action and no Sponsored or Featured label", () => {
    const listing = { ...toVendorCatalogueCard(product), sponsored: true, featured: true };
    const markup = renderToStaticMarkup(<ProductCard listing={listing} returnTo="/customer/explore" />);
    for (const key of ["ui.actions.bookNow", "ui.actions.buyNow", "ui.actions.viewDetails", "ui.labels.sponsored", "ui.labels.featured"]) {
      expect(markup).not.toContain(key);
    }
  });

  it("adds / night for hotels", () => {
    const hotel = {
      id: "h1", name: "Room", image: null, category: "Stay", categorySlug: "accommodation", price: 200, rating: 0, reviews: 0,
      outlet: { id: "out-h", name: "Hill Hotel", vendorName: "Hill Group", city: "Ipoh", state: "Perak" },
      property: { roomTypeCount: 3, fromPrice: 180 },
    } as never;
    const markup = renderToStaticMarkup(<ProductCard activity={hotel} />);
    expect(markup).toContain("Hill Hotel");
    expect(markup).toContain("RM180");
    expect(markup).toContain("/ ui.activityDetail.priceUnits.perNight");
    expect(markup).toContain("ui.property.roomTypes:3");
  });

  it("hides unavailable ratings without claiming that the product has no reviews", () => {
    const listing = { ...toVendorCatalogueCard(product), rating: 0, reviews: 0, ratingKnown: false };
    const markup = renderToStaticMarkup(<ProductCard listing={listing} returnTo="/customer" />);
    expect(markup).not.toContain("photo-rating-badge");
    expect(markup).not.toContain("ui.activity.noReviewsYet");
  });
});


describe("VendorCard and OutletCard", () => {
  const vendor = { id: "v1", name: "Kopi Kedai Lama", coverUrl: null, logoUrl: null, outlets: [{ id: "o1", name: "Main", city: "George Town", state: "Penang" }, { id: "o2", name: "Second", city: "Ipoh", state: "Perak" }] };

  it("shows the brand initials, the number of locations and Open now on one row, with share and no save", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={{ ...vendor, openNow: true }} />);
    expect(markup).toContain('data-vendor-card="v1"');
    expect(markup).toContain("ui.vendor.locationCount:2");
    expect(markup).toContain("ui.operatingHours.openNow");
    expect(markup).toContain('data-share="vendor"');
    expect(markup).not.toContain("data-save");
    expect(markup).toContain("/customer/vendors/v1");
  });

  it("leaves out the rating and open state when they are unknown", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={vendor} />);
    expect(markup).not.toContain("photo-rating-badge");
    expect(markup).not.toContain("ui.operatingHours");
  });

  it("names one outlet with its vendor, location and Closed now", () => {
    const markup = renderToStaticMarkup(<OutletCard outlet={{ id: "o1", name: "Kopi Kedai Lama · Campbell", vendorName: "Kopi Kedai Lama", city: "George Town", state: "Penang", openNow: false }} href="/customer/shop/o1" />);
    expect(markup).toContain('data-outlet-card="o1"');
    expect(markup).toContain("Kopi Kedai Lama</p>");
    expect(markup).toContain("George Town, Penang");
    expect(markup).toContain("ui.operatingHours.closedNow");
    expect(markup).toContain('data-share="outlet"');
  });
});

describe("PlaceActivityCard", () => {
  it("keeps the approved readable phone typography instead of compact product-card sizing", () => {
    const markup = renderToStaticMarkup(<PlaceActivityCard imageUrl={null} imageAlt="Trail" imageFallback={null} title="Trail" description="Full description" footer="Free Entry" />);
    expect(markup).toContain("max-sm:p-4");
    expect(markup).toContain("max-sm:text-base");
    expect(markup).toContain("max-sm:text-sm");
    expect(markup).not.toContain("max-sm:text-[11px]");
    expect(markup).not.toContain("max-sm:text-[13px]");
  });
  it("uses the place layout with the full description, and is not a link without an href", () => {
    const markup = renderToStaticMarkup(<PlaceActivityCard imageUrl={null} imageAlt="Trail" imageFallback={null} tag="Free entry" meta="Official visitor information" title="Public Forest Walking Trail" description="A self-guided forest walk." footer="Free entry" />);
    expect(markup).toContain('data-card-frame="place"');
    expect(markup).toContain("A self-guided forest walk.");
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("hover:scale-[1.04]");
  });
});

it("gives See More the same yellow hover and press feedback as the paging arrows", () => {
  const markup = renderToStaticMarkup(<SeeMoreLink href="/customer/explore" />);
  expect(markup).toContain("hover:text-accent");
  expect(markup).toContain("active:text-accent");
});
