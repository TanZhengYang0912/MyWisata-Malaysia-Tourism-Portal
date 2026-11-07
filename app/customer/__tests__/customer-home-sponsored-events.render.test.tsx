import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { DiscoveryResult } from "@/backend/core/types";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock("@/components/providers/saved-destinations", () => ({ useSavedDestinations: () => ({ savedStates: new Set<string>(), toggleSaved: vi.fn() }) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => () => true }));
vi.mock("@/components/customer/activity-card", () => ({ ActivityCard: () => null }));
vi.mock("@/components/customer/product-card", () => ({
  ProductCard: ({ listing, onSponsoredClick }: { listing: { id: string }; onSponsoredClick?: () => void }) => <a data-testid={`card-${listing.id}`} href="#" onClick={onSponsoredClick}>{listing.id}</a>,
}));
vi.mock("@/components/customer/vendor-card", () => ({ VendorCard: () => null }));
vi.mock("@/components/customer/save-toggle-button", () => ({ SaveToggleButton: () => null }));
vi.mock("@/components/customer/promotion-campaign-spotlight", () => ({ PromotionCampaignSpotlight: () => null }));
vi.mock("@/components/customer/event-partners-section", () => ({ EventPartnersSection: () => null }));
vi.mock("@/components/customer/home-destination-worm-indicator", () => ({ HomeDestinationWormIndicator: () => null }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const item = (id: string, placementId?: string) => ({
  id, name: id, price: 10, rating: 0, reviews: 0, requiresBooking: false, image: null, description: null,
  outlet: { id: `o-${id}`, vendorId: "v", city: "Ipoh", state: "Perak", verified: true, open: true },
  salesSummary: { outletCount: 1, fromPrice: 10 },
  sponsorship: placementId ? { placementId, label: "Sponsored" as const } : null,
}) as unknown as DiscoveryResult;

describe("Home Featured Highlights sponsored analytics", () => {
  let document: TestDocument;
  let container: TestElement;
  let root: ReturnType<typeof import("react-dom/client").createRoot>;
  let createRoot: typeof import("react-dom/client").createRoot;
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.unstubAllGlobals();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  const events = () => fetchMock.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit];
    return [url, JSON.parse(String(init.body)).eventType];
  });

  it("records one impression per placement across re-renders and a click on a sponsored card only", async () => {
    const { CustomerHomeClient } = await import("@/app/customer/customer-home-client");
    const items = [item("paid", "pl-1"), item("plain")];
    await act(async () => { root.render(<CustomerHomeClient highlightItems={items} forYouItems={[]} vendors={[]} campaign={null} />); });
    await act(async () => { root.render(<CustomerHomeClient highlightItems={[...items]} forYouItems={[]} vendors={[]} campaign={null} />); });
    expect(events()).toEqual([["/api/sponsored-placements/pl-1/events", "impression"]]);

    await act(async () => { findOne(container, (element) => element.getAttribute("data-testid") === "card-plain").dispatchEvent(new TestEvent("click", { bubbles: true })); });
    await act(async () => { findOne(container, (element) => element.getAttribute("data-testid") === "card-paid").dispatchEvent(new TestEvent("click", { bubbles: true })); });
    expect(events()).toEqual([
      ["/api/sponsored-placements/pl-1/events", "impression"],
      ["/api/sponsored-placements/pl-1/events", "click"],
    ]);
  });
});
