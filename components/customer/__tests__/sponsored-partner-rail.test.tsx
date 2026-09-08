import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryResult } from "@/backend/core/types";
import {
  TestEvent,
  findElements,
  findOne,
  installTestDom,
  type TestDocument,
  type TestElement,
} from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => ({
      "ui.search.sponsoredRecommendations": "Sponsored recommendations",
      "ui.search.sponsoredDescription": "Paid placements matched to your current search.",
      "ui.search.previousAdvertisement": "Previous advertisement",
      "ui.search.nextAdvertisement": "Next advertisement",
      "ui.labels.sponsored": "Sponsored",
      "ui.search.providedBy": `By ${options?.vendor ?? ""}`,
      "ui.actions.viewDetails": "View experience",
    } as Record<string, string>)[key] ?? key,
  }),
}));

import { SponsoredPartnerRail } from "@/components/customer/sponsored-partner-rail";

function advertisement(id: string, placementId = "11111111-1111-4111-8111-111111111111"): DiscoveryResult {
  return {
    id,
    outletId: `outlet-${id}`,
    name: "Heritage Night Walk",
    category: "Activity",
    categorySlug: "activity",
    description: "Guided street art experience",
    image: "/assets/customer/penang/penang-street-art.webp",
    price: 48,
    rating: 4.8,
    reviews: 24,
    duration: "2 hours",
    requiresBooking: true,
    variants: [],
    outlet: {
      id: `outlet-${id}`,
      vendorId: `vendor-${id}`,
      vendorName: "George Town Walks",
      name: "Armenian Street",
      category: "Activity",
      state: "Penang",
      city: "George Town",
      address: "Malaysia",
      lat: 5.4141,
      lng: 100.3288,
      hours: "6:00 PM - 10:00 PM",
      verified: true,
      open: true,
      rating: 4.8,
      reviews: 24,
    },
    sponsorship: { placementId, label: "Sponsored" },
  };
}

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let observerCallback: IntersectionObserverCallback | null = null;
let observedTargets: Element[] = [];

class TestIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }

  observe(target: Element) {
    observedTargets.push(target);
  }

  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "0px";
  thresholds = [0.5];
}

async function render(root: ReturnType<typeof createRoot>, element: React.ReactElement) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("SponsoredPartnerRail", () => {
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue(Response.json({ data: { recorded: true }, error: null }));
    observerCallback = null;
    observedTargets = [];
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("hides the complete section when there are no eligible advertisements", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[]} />);
    expect(container.textContent).toBe("");
  });

  it("renders a sponsored name-card rail that opens the activity", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[advertisement("activity-1")]} />);

    expect(container.textContent).toContain("Sponsored recommendations");
    expect(container.textContent).toContain("Sponsored");
    expect(container.textContent).toContain("Heritage Night Walk");
    expect(container.textContent).toContain("George Town Walks");
    expect(container.textContent).toContain("George Town, Penang");
    expect(findOne(container, (element) => element.tagName === "A").getAttribute("href")).toBe("/customer/activity/activity-1");

    const viewport = findOne(container, (element) => element.getAttribute("data-testid") === "sponsored-partner-rail");
    expect(viewport.className).toContain("overflow-x-auto");
    expect(viewport.className).toContain("snap-x");
    expect(findElements(container, (element) => element.tagName === "ARTICLE")[0].className).toContain("snap-start");
  });

  it("scrolls backward and forward with the named desktop controls", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", "22222222-2222-4222-8222-222222222222"),
    ]} />);
    const viewport = findOne(container, (element) => element.getAttribute("data-testid") === "sponsored-partner-rail");
    const scrollBy = vi.fn();
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 2000 });
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, value: 500 });
    Object.defineProperty(viewport, "scrollBy", { configurable: true, value: scrollBy });
    await act(async () => {
      viewport.dispatchEvent(new TestEvent("scroll"));
      await Promise.resolve();
    });

    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Previous advertisement"));
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Next advertisement"));

    expect(scrollBy).toHaveBeenNthCalledWith(1, { left: -800, behavior: "smooth" });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { left: 800, behavior: "smooth" });
  });

  it("disables navigation controls at the relevant scroll edge", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", "22222222-2222-4222-8222-222222222222"),
    ]} />);
    const viewport = findOne(container, (element) => element.getAttribute("data-testid") === "sponsored-partner-rail");
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 2000 });
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, value: 0 });

    await act(async () => {
      viewport.dispatchEvent(new TestEvent("scroll"));
      await Promise.resolve();
    });

    const previous = findOne(container, (element) => element.getAttribute("aria-label") === "Previous advertisement");
    const next = findOne(container, (element) => element.getAttribute("aria-label") === "Next advertisement");
    expect(previous.getAttribute("disabled")).not.toBeNull();
    expect(next.getAttribute("disabled")).toBeNull();

    Object.defineProperty(viewport, "scrollLeft", { configurable: true, value: 1000 });
    await act(async () => {
      viewport.dispatchEvent(new TestEvent("scroll"));
      await Promise.resolve();
    });

    expect(previous.getAttribute("disabled")).toBeNull();
    expect(next.getAttribute("disabled")).not.toBeNull();
  });

  it("records one visible impression and an exact click event without extra metadata", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[advertisement("activity-1")]} />);
    expect(observedTargets).toHaveLength(1);
    const target = observedTargets[0];

    await act(async () => {
      observerCallback?.([
        { isIntersecting: true, intersectionRatio: 0.75, target } as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      observerCallback?.([
        { isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      await Promise.resolve();
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/sponsored-placements/11111111-1111-4111-8111-111111111111/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventType: "impression", productId: "activity-1" }),
      }),
    );

    await click(findOne(container, (element) => element.tagName === "A"));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/api/sponsored-placements/11111111-1111-4111-8111-111111111111/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventType: "click", productId: "activity-1" }),
      }),
    );
  });
});
