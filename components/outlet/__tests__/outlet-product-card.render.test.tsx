import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => options?.count !== undefined ? `${key}:${options.count}` : key, i18n: { language: "en" } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/providers/wishlist", () => ({ useOptionalWishlist: () => null }));
vi.mock("@/components/customer/product-save-button", () => ({ ProductSaveButton: () => null }));
vi.mock("@/components/customer/localized-content", () => ({ LocalizedContent: ({ sourceText, children }: { sourceText: string; children?: (value: { text: string; control: null }) => React.ReactNode }) => children ? children({ text: sourceText, control: null }) : <span>{sourceText}</span> }));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR}</span> }));

import { OutletProductCard } from "@/components/outlet/outlet-menu";

const outlet = { id: "o1", name: "Kuah Outlet", vendorName: "Langkawi Paddle" } as unknown as OutletRendererOutlet;
const product: OutletRendererProduct = {
  id: "p1", name: "Kayak", base_price: 146, category: "Activity", product_type: "activity", requires_booking: true, available_stock: null, featured: false,
};

const render = (overrides: Partial<OutletRendererProduct> = {}) => renderToStaticMarkup(<OutletProductCard outlet={outlet} product={{ ...product, ...overrides }} />);

describe("outlet menu product card", () => {
  it("is the shared ProductCard, pinned to this outlet, with Type · Vendor and the outlet price", () => {
    const markup = render({ rating: 4.6, reviews: 76 });
    expect(markup).toContain('data-card-frame="grid"');
    expect(markup).toContain("Kayak");
    expect(markup).toContain("RM146");
    expect(markup).not.toContain("ui.vendor.from");
    expect(markup).toContain("categories.activity · Langkawi Paddle");
    expect(markup).toContain('data-slot="photo-rating-badge"');
    expect(markup).toContain("4.6");
    expect(markup).toContain("outletId=o1");
    expect(markup).toContain(encodeURIComponent("/customer/outlets/o1"));
  });

  it("has no Add to cart, Buy or Book button and no Featured chip", () => {
    const markup = render({ featured: true });
    for (const key of ["ui.actions.addToCart", "ui.actions.buyNow", "ui.actions.bookNow", "ui.outletMenu.chooseTime", "ui.labels.featured"]) {
      expect(markup).not.toContain(key);
    }
    expect(markup).not.toContain("<button");
  });

  it("hides unknown ratings but keeps a genuine no-review badge", () => {
    expect(render({ rating: 0, reviews: 0, ratingKnown: false })).not.toContain('data-slot="photo-rating-badge"');
    expect(render({ rating: 0, reviews: 0, ratingKnown: true })).toContain('data-slot="photo-rating-badge"');
  });
});
