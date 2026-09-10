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

const SECOND_PLACEMENT_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_PLACEMENT_ID = "33333333-3333-4333-8333-333333333333";
const FOURTH_PLACEMENT_ID = "44444444-4444-4444-8444-444444444444";
const FIFTH_PLACEMENT_ID = "55555555-5555-4555-8555-555555555555";

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => ({
      "ui.search.sponsoredRecommendations": "Sponsored recommendations",
      "ui.search.sponsoredDescription": "Promoted experiences from verified local partners.",
      "ui.search.sponsoredCarousel": "Sponsored recommendations carousel",
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
    name: `Advertisement ${id}`,
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
let reducedMotion = false;
let mediaQueryListeners: Array<(event: { matches: boolean }) => void> = [];

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

async function dispatch(element: TestElement | TestDocument, event: TestEvent) {
  await act(async () => {
    element.dispatchEvent(event);
    await Promise.resolve();
  });
}

async function advanceTimers(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

function setReducedMotion(matches: boolean) {
  reducedMotion = matches;
  for (const listener of mediaQueryListeners) listener({ matches });
}

describe("SponsoredPartnerRail", () => {
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fetch.mockReset().mockResolvedValue(Response.json({ data: { recorded: true }, error: null }));
    observerCallback = null;
    observedTargets = [];
    reducedMotion = false;
    mediaQueryListeners = [];
    Object.defineProperty(document.defaultView, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        get matches() { return reducedMotion; },
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => mediaQueryListeners.push(listener),
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
          mediaQueryListeners = mediaQueryListeners.filter((candidate) => candidate !== listener);
        },
      })),
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it("hides the complete section when there are no eligible advertisements", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[]} />);
    expect(container.textContent).toBe("");
  });

  it("renders one full-width sponsored banner without a horizontal track", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);

    expect(container.textContent).toContain("Sponsored recommendations");
    expect(container.textContent).toContain("Sponsored");
    expect(container.textContent).toContain("Advertisement activity-1");
    expect(container.textContent).not.toContain("Advertisement activity-2");
    expect(container.textContent).toContain("George Town Walks");
    expect(container.textContent).toContain("George Town, Penang");
    expect(findOne(container, (element) => element.tagName === "A").getAttribute("href")).toBe("/customer/activity/activity-1");
    expect(findElements(container, (element) => element.tagName === "ARTICLE")).toHaveLength(1);

    const viewport = findOne(container, (element) => element.getAttribute("data-testid") === "sponsored-partner-rail");
    expect(viewport.getAttribute("aria-roledescription")).toBe("Sponsored recommendations carousel");
    expect(viewport.className).toContain("w-full");
    expect(viewport.className).toContain("overflow-hidden");
    expect(viewport.className).not.toContain("overflow-x-auto");
    expect(viewport.className).not.toContain("snap-x");
    expect(findElements(container, (element) => element.tagName === "ARTICLE")[0].className).not.toContain("snap-start");
  });

  it("advances every three seconds and loops from the last advertisement to the first", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);

    expect(container.textContent).toContain("Advertisement activity-1");
    await advanceTimers(2999);
    expect(container.textContent).toContain("Advertisement activity-1");
    await advanceTimers(1);
    expect(container.textContent).toContain("Advertisement activity-2");
    await advanceTimers(3000);
    expect(container.textContent).toContain("Advertisement activity-1");
  });

  it("loops in both manual directions and resets the autoplay interval", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);

    const previous = findOne(container, (element) => element.getAttribute("aria-label") === "Previous advertisement");
    const next = findOne(container, (element) => element.getAttribute("aria-label") === "Next advertisement");
    expect(previous.getAttribute("disabled")).toBeNull();
    expect(next.getAttribute("disabled")).toBeNull();

    await click(previous);
    expect(container.textContent).toContain("Advertisement activity-2");
    await click(next);
    expect(container.textContent).toContain("Advertisement activity-1");

    await advanceTimers(2000);
    await click(next);
    expect(container.textContent).toContain("Advertisement activity-2");
    await advanceTimers(2999);
    expect(container.textContent).toContain("Advertisement activity-2");
    await advanceTimers(1);
    expect(container.textContent).toContain("Advertisement activity-1");
  });

  it("reveals desktop navigation on carousel hover or focus while keeping touch controls visible", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);

    const viewport = findOne(container, (element) => element.getAttribute("data-testid") === "sponsored-partner-rail");
    const previous = findOne(container, (element) => element.getAttribute("aria-label") === "Previous advertisement");
    const next = findOne(container, (element) => element.getAttribute("aria-label") === "Next advertisement");

    expect(viewport.className).toContain("group/carousel");
    for (const control of [previous, next]) {
      const classNames = control.className.split(/\s+/);
      expect(classNames).toContain("md:opacity-0");
      expect(classNames).toContain("md:group-hover/carousel:opacity-100");
      expect(classNames).toContain("md:group-focus-within/carousel:opacity-100");
      expect(classNames).not.toContain("opacity-0");
    }
  });

  it("returns to the first advertisement when filtering replaces the active placement", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Next advertisement"));
    expect(container.textContent).toContain("Advertisement activity-2");

    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-3", THIRD_PLACEMENT_ID),
      advertisement("activity-4", FOURTH_PLACEMENT_ID),
    ]} />);

    expect(container.textContent).toContain("Advertisement activity-3");
    expect(container.textContent).not.toContain("Advertisement activity-4");

    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-5", FIFTH_PLACEMENT_ID),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);

    expect(container.textContent).toContain("Advertisement activity-5");
    expect(container.textContent).not.toContain("Advertisement activity-2");
  });

  it("pauses autoplay during pointer and keyboard interaction", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);
    const viewport = findOne(container, (element) => element.getAttribute("data-testid") === "sponsored-partner-rail");
    await dispatch(viewport, Object.assign(new TestEvent("mouseover", { bubbles: true }), { relatedTarget: null }));
    await advanceTimers(3000);
    expect(container.textContent).toContain("Advertisement activity-1");
    await dispatch(viewport, Object.assign(new TestEvent("mouseout", { bubbles: true }), { relatedTarget: null }));
    await advanceTimers(3000);
    expect(container.textContent).toContain("Advertisement activity-2");

    const currentLink = findOne(viewport, (element) => element.tagName === "A");
    await dispatch(currentLink, new TestEvent("focusin", { bubbles: true }));
    await advanceTimers(3000);
    expect(container.textContent).toContain("Advertisement activity-2");
    const focusOut = new TestEvent("focusout", { bubbles: true }) as TestEvent & { relatedTarget: TestElement | null };
    focusOut.relatedTarget = document.body;
    await dispatch(currentLink, focusOut);
    await advanceTimers(3000);
    expect(container.textContent).toContain("Advertisement activity-1");
  });

  it("pauses when hidden or reduced motion is requested while keeping manual controls", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await dispatch(document, new TestEvent("visibilitychange"));
    await advanceTimers(3000);
    expect(container.textContent).toContain("Advertisement activity-1");

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await dispatch(document, new TestEvent("visibilitychange"));
    await act(async () => {
      setReducedMotion(true);
      await Promise.resolve();
    });
    await advanceTimers(3000);
    expect(container.textContent).toContain("Advertisement activity-1");

    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Next advertisement"));
    expect(container.textContent).toContain("Advertisement activity-2");
  });

  it("records one impression for each visible slide and an exact click event without extra metadata", async () => {
    await render(root, <SponsoredPartnerRail advertisements={[
      advertisement("activity-1"),
      advertisement("activity-2", SECOND_PLACEMENT_ID),
    ]} />);
    expect(observedTargets).toHaveLength(1);
    const firstTarget = observedTargets[0];

    await act(async () => {
      observerCallback?.([
        { isIntersecting: true, intersectionRatio: 0.75, target: firstTarget } as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      observerCallback?.([
        { isIntersecting: true, intersectionRatio: 1, target: firstTarget } as IntersectionObserverEntry,
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

    await advanceTimers(3000);
    expect(observedTargets).toHaveLength(2);
    const secondTarget = observedTargets[1];
    await act(async () => {
      observerCallback?.([
        { isIntersecting: true, intersectionRatio: 1, target: secondTarget } as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      await Promise.resolve();
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      `/api/sponsored-placements/${SECOND_PLACEMENT_ID}/events`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventType: "impression", productId: "activity-2" }),
      }),
    );

    await click(findOne(container, (element) => element.tagName === "A"));
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      `/api/sponsored-placements/${SECOND_PLACEMENT_ID}/events`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventType: "click", productId: "activity-2" }),
      }),
    );
  });
});
