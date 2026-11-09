import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  OutletRendererOutlet,
  OutletRendererProduct,
  OutletPageDocument,
} from "@/components/outlet/outlet-block-types";
import { OutletPageRenderer } from "@/components/outlet/outlet-page-renderer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en" },
  }),
}));

vi.mock("@/components/providers/auth", () => ({
  useAuth: () => ({ currentUser: null, capabilities: {}, refreshUser: vi.fn() }),
}));
vi.mock("@/components/providers/cart", () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

const document: OutletPageDocument = {
  version: 1,
  hero: { id: "hero", type: "hero", title: "Local shop", body: "Made for travellers" },
  blocks: [],
  gallery: [],
  brandColour: "#0f172a",
  fontFamily: "sans-serif",
  featuredIds: [],
  seoTitle: "Local shop",
  seoDescription: "",
};

const outlet: OutletRendererOutlet = { id: "outlet-1", name: "Local shop" };
const product: OutletRendererProduct = {
  id: "product-1",
  name: "Local Tea",
  base_price: 15,
  variant_id: "variant-1",
  requires_booking: false,
};

describe("Outlet Manager shop preview", () => {
  it("renders product details without requiring customer providers or exposing cart and save actions", () => {
    const markup = renderToStaticMarkup(
      <OutletPageRenderer
        document={document}
        outlet={outlet}
        products={[product]}
        mode="public"
      />,
    );

    expect(markup).toContain("Local Tea");
    expect(markup).not.toContain("<button");
  });
});
