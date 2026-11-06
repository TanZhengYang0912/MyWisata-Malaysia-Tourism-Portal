import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => options?.count !== undefined ? `${key}:${options.count}` : key, i18n: { language: "en" } }),
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
const badgeOf = (markup: string) => markup.match(/<div[^>]*data-slot="photo-rating-badge"[\s\S]*?<\/div>/)?.[0] ?? "";
const footerOf = (markup: string) => markup.slice(markup.indexOf("border-t border-border pt-3"));

describe("outlet menu product card rating", () => {
  it("shows the rating on the photo and not in the footer", () => {
    const markup = render({ rating: 4.6, reviews: 76 });
    expect(badgeOf(markup)).toContain(">4.6<");
    expect(badgeOf(markup)).toContain("(76)");
    expect(footerOf(markup)).not.toContain("(76)");
  });

  it("says No reviews yet on the photo when the product has no reviews", () => {
    expect(badgeOf(render({ rating: 0, reviews: 0 }))).toContain("ui.activity.noReviewsYet");
  });

  it("shows no badge when the rating is not provided, as in the vendor previews", () => {
    expect(render({})).not.toContain('data-slot="photo-rating-badge"');
  });

  it("keeps Featured beside the category chip, away from the badge", () => {
    const markup = render({ featured: true, rating: 4.6, reviews: 76 });
    const group = markup.match(/<div class="flex min-w-0 flex-wrap items-end gap-1\.5">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(group).toContain("Activity");
    expect(group).toContain("ui.map.featured");
    expect(group).not.toContain("photo-rating-badge");
    expect(markup.indexOf("ui.map.featured")).toBeLessThan(markup.indexOf('data-slot="photo-rating-badge"'));
  });
});
