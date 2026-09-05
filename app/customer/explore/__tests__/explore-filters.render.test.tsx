import React from "react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestEvent, findElements, findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  searchActivities: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.params,
}));
vi.mock("next/link", () => ({ default: (props: { children?: React.ReactNode }) => <a {...props} /> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => ({
      "ui.explore.destinations": "Destinations",
      "ui.explore.experiences": "Experiences",
      "ui.discovery.state": "State",
      "ui.discovery.maximumPrice": "Maximum price",
      "ui.discovery.freeOnly": "Free entry",
      "ui.discovery.bookableOnly": "Booking required",
      "ui.discovery.hiddenGemOnly": "Hidden Gem",
      "ui.discovery.familyFriendlyOnly": "Family Friendly",
      "ui.discovery.coupleFriendlyOnly": "Couple Friendly",
      "ui.discovery.showAll": `Show all (${options?.count ?? ""})`,
      "categories.activity": "Activity",
      "ui.map.types.nature": "Nature",
    } as Record<string, string>)[key] ?? key,
  }),
}));
vi.mock("@/backend/domains/catalogue", () => ({ CATEGORIES: [{ id: "activity", labelKey: "categories.activity" }], STATES_MY: ["All Malaysia", "Sabah"], searchActivities: mocks.searchActivities }));
vi.mock("@/components/customer/activity-card", () => ({ ActivityCard: ({ activity }: { activity: { id: string; name: string } }) => <article data-testid={`activity-${activity.id}`}>{activity.name}</article> }));
vi.mock("@/components/demo-map/story-map", () => ({ StoryMap: ({ activities }: { activities: { id: string }[] }) => <output data-testid="story-map-ids">{activities.map((activity) => activity.id).join(",")}</output> }));

import { ExploreClient } from "../explore-client";

const activities = Array.from({ length: 10 }, (_, index) => ({
  id: `result-${index + 1}`,
  name: `Result ${index + 1}`,
  category: "Activity",
  categorySlug: "activity",
  typeSlugs: ["nature"],
  price: 0,
  rating: 5,
  reviews: 1,
  duration: "",
  requiresBooking: true,
  isHiddenGem: true,
  isFamilyFriendly: true,
  isCoupleFriendly: true,
  outlet: { id: "outlet", city: "Kota Kinabalu", state: "Sabah", open: true, verified: true },
})) as never[];

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;

function button(container: TestElement, name: string) {
  return findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === name);
}

function labelled(container: TestElement, label: string) {
  return findOne(container, (element) => element.getAttribute("aria-label") === label);
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(root: ReturnType<typeof createRoot>, element: React.ReactElement) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ExploreClient URL-backed advanced filters", () => {
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.params = new URLSearchParams("state=Sabah&category=activity&type=activity%3Anature&priceMax=100&free=1&bookable=1&hiddenGem=1&family=1&couple=1");
    mocks.replace.mockReset();
    mocks.searchActivities.mockReset().mockResolvedValue(activities);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("restores URL filters, requests matching results, and progressively reveals the shared map order", async () => {
    await render(root, <ExploreClient initialActivities={activities} />);
    expect(mocks.searchActivities).toHaveBeenCalledWith({
      q: "", state: "Sabah", categories: ["activity"], types: ["activity:nature"], priceMax: 100,
      freeOnly: true, bookableOnly: true, hiddenGemOnly: true, familyFriendlyOnly: true, coupleFriendlyOnly: true,
    });

    expect(findOne(container, (element) => element.getAttribute("data-testid") === "story-map-ids").textContent).toBe(Array.from({ length: 10 }, (_, index) => `result-${index + 1}`).join(","));
    await click(button(container, "Experiences"));
    expect(labelled(container, "State").value).toBe("Sabah");
    expect(labelled(container, "Maximum price").value).toBe("100");
    for (const label of ["Activity", "Nature", "Free entry", "Booking required", "Hidden Gem", "Family Friendly", "Couple Friendly"]) {
      expect(labelled(container, label).getAttribute("aria-pressed")).toBe("true");
    }
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false)).toHaveLength(8);

    await click(button(container, "Show all (10)"));
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false)).toHaveLength(10);
    await click(button(container, "Activity"));
    await click(button(container, "Activity"));
    expect(labelled(container, "Nature").getAttribute("aria-pressed")).toBe("true");
    const destination = String(mocks.replace.mock.lastCall?.[0]);
    expect(destination).toContain("category=activity");
    expect(destination).not.toContain("type=");
    mocks.params = new URL(destination, "https://mywisata.test").searchParams;

    act(() => root.unmount());
    root = createRoot(container as unknown as Element);
    await render(root, <ExploreClient initialActivities={activities} />);
    expect(findOne(container, (element) => element.getAttribute("data-testid") === "story-map-ids").textContent).toBe(Array.from({ length: 10 }, (_, index) => `result-${index + 1}`).join(","));
    await click(button(container, "Experiences"));
    expect(labelled(container, "State").value).toBe("Sabah");
    expect(labelled(container, "Nature").getAttribute("aria-pressed")).toBe("true");
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false)).toHaveLength(8);
  });
});
