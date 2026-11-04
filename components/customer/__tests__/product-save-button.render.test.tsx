import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/providers/auth", () => ({
  useAuth: () => ({ currentUser: null, loading: false, capabilities: {}, refreshUser: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/customer/activity/p1",
  useRouter: () => ({ push: vi.fn() }),
}));

import { ProductSaveButton } from "../product-save-button";
import { WishlistProvider } from "@/components/providers/wishlist";
import { CustomerCapabilityGateProvider } from "@/components/customer/customer-capability-gate-dialog";

describe("ProductSaveButton", () => {
  it("renders nothing outside the customer wishlist, so the vendor shop preview does not crash", () => {
    expect(renderToStaticMarkup(<ProductSaveButton productId="p1" productName="Satay" />)).toBe("");
  });

  it("keeps the accessible save button in the customer providers", () => {
    const markup = renderToStaticMarkup(
      <WishlistProvider>
        <CustomerCapabilityGateProvider>
          <ProductSaveButton productId="p1" productName="Satay" className="absolute right-3" />
        </CustomerCapabilityGateProvider>
      </WishlistProvider>,
    );

    expect(markup).toContain('aria-label="ui.activity.save"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("absolute right-3");
  });
});
