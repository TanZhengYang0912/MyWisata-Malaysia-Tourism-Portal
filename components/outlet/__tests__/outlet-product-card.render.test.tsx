import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => options?.price !== undefined ? `${key}:${options.price}` : options?.count !== undefined ? `${key}:${options.count}` : key, i18n: { language: "en" } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/providers/cart", () => ({ useCart: () => ({ addItem: vi.fn(), selectedKeys: new Set<string>(), setSelectedKeys: vi.fn() }) }));
vi.mock("@/components/providers/app-dialog", () => ({ useAppDialog: () => ({ alert: vi.fn() }) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: vi.fn() }) }));
vi.mock("@/components/customer/product-save-button", () => ({ ProductSaveButton: () => null }));
vi.mock("@/components/customer/localized-content", () => ({ LocalizedContent: ({ sourceText }: { sourceText: string }) => <span>{sourceText}</span> }));

import { OutletProductCard } from "@/components/outlet/outlet-menu";

const outlet = { id: "o1", name: "Kuah Outlet" } as unknown as OutletRendererOutlet;
const product: OutletRendererProduct = {
  id: "p1", name: "Kayak", base_price: 146, category: "Activity", requires_booking: true, available_stock: null, featured: false,
};

const render = (overrides: Partial<OutletRendererProduct>) => renderToStaticMarkup(<OutletProductCard outlet={outlet} product={{ ...product, ...overrides }} />);

describe("compact outlet menu product card", () => {
  it("keeps the product name, price, and detail action without rating or category metadata", () => {
    const markup = render({ rating: 4.6, reviews: 76 });
    expect(markup).toContain("Kayak");
    expect(markup).toContain("146");
    expect(markup).toContain("ui.outletMenu.chooseTime");
    expect(markup).not.toContain('data-slot="photo-rating-badge"');
    expect(markup).not.toContain("Activity");
  });

  it("does not show a rating badge when the product has no reviews", () => {
    const markup = render({ rating: 0, reviews: 0 });
    expect(markup).toContain("Kayak");
    expect(markup).not.toContain('data-slot="photo-rating-badge"');
    expect(markup).not.toContain("ui.activity.noReviewsYet");
  });

  it("hides featured and category chips from the compact product card", () => {
    const markup = render({ featured: true, rating: 4.6, reviews: 76 });
    expect(markup).not.toContain("Activity");
    expect(markup).not.toContain("ui.map.featured");
    expect(markup).not.toContain('data-slot="photo-rating-badge"');
  });
});
