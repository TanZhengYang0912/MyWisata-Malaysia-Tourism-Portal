import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import { destinationHref } from "@/lib/customer/malaysia-destinations";

const push = vi.fn();
const toggleSaved = vi.fn();
const goToPage = vi.fn();
const pager = { page: 0, pageCount: 4, progress: 0, goToPage };

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock("@/components/providers/saved-destinations", () => ({ useSavedDestinations: () => ({ savedStates: new Set<string>(), toggleSaved }) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => () => true }));
vi.mock("@/components/customer/use-home-destination-pager", () => ({ useHomeDestinationPager: () => pager }));
vi.mock("@/components/customer/activity-card", () => ({ ActivityCard: () => null }));
vi.mock("@/components/customer/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/components/customer/vendor-card", () => ({ VendorCard: () => null }));
vi.mock("@/components/customer/save-toggle-button", () => ({
  SaveToggleButton: ({ onClick, title }: { onClick: () => void; title: string }) => <button type="button" data-save="" title={title} onClick={onClick} />,
}));
vi.mock("@/components/customer/promotion-campaign-spotlight", () => ({ PromotionCampaignSpotlight: () => null }));
vi.mock("@/components/customer/event-partners-section", () => ({ EventPartnersSection: () => null }));
vi.mock("@/components/customer/home-destination-worm-indicator", () => ({ HomeDestinationWormIndicator: () => null }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

describe("Home destination selection", () => {
  let document: TestDocument;
  let container: TestElement;
  let root: ReturnType<typeof import("react-dom/client").createRoot>;
  let createRoot: typeof import("react-dom/client").createRoot;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });
  beforeEach(async () => {
    push.mockClear();
    toggleSaved.mockClear();
    goToPage.mockClear();
    fetchMock.mockClear();
    pager.page = 0;
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    const { CustomerHomeClient } = await import("@/app/customer/customer-home-client");
    await act(async () => { root.render(<CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />); });
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  const title = () => findOne(container, (element) => element.tagName === "H1").textContent;
  const stateCard = (state: string) => findOne(container, (element) => element.getAttribute("aria-pressed") !== null && element.textContent === state);
  const fire = async (element: TestElement, type: string, init: Record<string, unknown> = {}) => {
    const event = Object.assign(new TestEvent(type, { bubbles: true }), init);
    await act(async () => { element.dispatchEvent(event); });
    return event;
  };
  const arrow = (label: string) => findOne(container, (element) => element.getAttribute("aria-label") === label);

  it("shows the active state and keeps 16 selectors with 16 save controls", () => {
    expect(title()).toBe("Kuala Lumpur");
    expect(findElements(container, (element) => element.getAttribute("aria-pressed") !== null)).toHaveLength(16);
    expect(findElements(container, (element) => element.getAttribute("data-save") !== null)).toHaveLength(16);
  });

  it("selects on click and navigates once on double-click", async () => {
    const penang = stateCard("Penang");
    await fire(penang, "click");
    expect(title()).toBe("Penang");
    expect(push).not.toHaveBeenCalled();
    await fire(penang, "dblclick");
    expect(push).toHaveBeenCalledExactlyOnceWith(destinationHref("Penang"));
    expect(penang.getAttribute("title")).toBe("ui.home.destinationDoubleClick");
  });

  it("enters the state with Enter but leaves Space as the native select key", async () => {
    const enter = await fire(stateCard("Johor"), "keydown", { key: "Enter" });
    expect(enter.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledExactlyOnceWith(destinationHref("Johor"));
    await fire(stateCard("Johor"), "keydown", { key: " " });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("saves without selecting or navigating", async () => {
    const save = findElements(container, (element) => element.getAttribute("data-save") !== null)[1];
    await fire(save, "click");
    expect(toggleSaved).toHaveBeenCalledTimes(1);
    expect(title()).toBe("Kuala Lumpur");
    expect(push).not.toHaveBeenCalled();
  });

  it("gives screen-reader and touch users a real link into the selected state", async () => {
    const link = () => findOne(container, (element) => element.tagName === "A" && element.getAttribute("data-destination-entry") !== null);
    expect(link().getAttribute("href")).toBe(destinationHref("Kuala Lumpur"));
    await fire(stateCard("Sabah"), "click");
    expect(link().getAttribute("href")).toBe(destinationHref("Sabah"));
    expect(link().textContent).toBe("ui.home.viewDestination");
  });

  it("keeps the latest state after rapid selections without fetching", async () => {
    for (const state of ["Penang", "Sabah", "Melaka", "Perak"]) await fire(stateCard(state), "click");
    expect(title()).toBe("Perak");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("pages with the arrows and disables them at the ends", async () => {
    expect(arrow("ui.map.previous").getAttribute("disabled")).not.toBeNull();
    await fire(arrow("ui.map.next"), "click");
    expect(goToPage).toHaveBeenCalledExactlyOnceWith(1);

    pager.page = 3;
    const { CustomerHomeClient } = await import("@/app/customer/customer-home-client");
    await act(async () => { root.render(<CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />); });
    expect(arrow("ui.map.next").getAttribute("disabled")).not.toBeNull();
    await fire(arrow("ui.map.previous"), "click");
    expect(goToPage).toHaveBeenLastCalledWith(2);
  });
});
