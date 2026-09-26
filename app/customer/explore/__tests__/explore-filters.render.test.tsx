import React from "react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestEvent, findElements, findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  searchActivities: vi.fn(),
  filterComputedActivities: vi.fn((_filters: unknown, candidates: unknown[]) => candidates),
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
      "ui.discovery.priceInvalid": "Enter a value between 0 and 10,000.",
      "ui.discovery.freeOnly": "Free entry",
      "ui.discovery.bookableOnly": "Booking required",
      "ui.discovery.hiddenGemOnly": "Hidden Gem",
      "ui.discovery.familyFriendlyOnly": "Family Friendly",
      "ui.discovery.coupleFriendlyOnly": "Couple Friendly",
      "ui.discovery.showAll": `Show all (${options?.count ?? ""})`,
      "categories.activity": "Activity",
      "categories.hiddenGem": "Hidden Gem",
      "ui.discovery.searchLabel": "Search",
      "ui.discovery.openingHours": "Opening hours",
      "ui.discovery.locationAndPrice": "Location and budget",
      "ui.discovery.experienceTypes": "Activity types",
      "ui.discovery.preferences": "Preferences",
      "ui.labels.openNow": "Open now",
      "ui.map.moreFilters": "More filters",
      "ui.map.activeFilters": "Active filters",
      "ui.map.types.nature": "Nature",
    } as Record<string, string>)[key] ?? key,
  }),
}));
vi.mock("@/backend/domains/catalogue", () => ({
  CATEGORIES: [{ id: "activity", labelKey: "categories.activity" }, { id: "hidden_gem", labelKey: "categories.hiddenGem" }],
  STATES_MY: ["All Malaysia", "Sabah"],
  searchActivities: mocks.searchActivities,
  filterComputedActivities: mocks.filterComputedActivities,
}));
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
  const matches = findElements(container, (element) => element.getAttribute("aria-label") === label);
  return matches[matches.length - 1] ?? findOne(container, (element) => element.getAttribute("aria-label") === label);
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setInputValue(input: TestElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  setter?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new TestEvent("input", { bubbles: true }));
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
    mocks.filterComputedActivities.mockReset().mockImplementation((_filters, candidates) => candidates);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("restores URL filters against server-provided candidates and progressively reveals the shared map order", async () => {
    await render(root, <ExploreClient initialActivities={activities} />);
    expect(mocks.filterComputedActivities).toHaveBeenCalledWith({
      q: "", state: "Sabah", categories: ["activity"], types: ["activity:nature"], priceMax: 100,
      operatingDays: [], hoursMode: "during", timeAt: null,
      timeFrom: null, timeTo: null,
      overnight: false, openNow: false,
      freeOnly: true, bookableOnly: true, hiddenGemOnly: true, familyFriendlyOnly: true, coupleFriendlyOnly: true,
    }, activities);
    expect(mocks.searchActivities).not.toHaveBeenCalled();

    expect(findOne(container, (element) => element.getAttribute("data-testid") === "story-map-ids").textContent).toBe(Array.from({ length: 10 }, (_, index) => `result-${index + 1}`).join(","));
    await click(button(container, "Experiences"));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent?.startsWith("More filters") === true));
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
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent?.startsWith("More filters") === true));
    expect(labelled(container, "State").value).toBe("Sabah");
    expect(labelled(container, "Nature").getAttribute("aria-pressed")).toBe("true");
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false)).toHaveLength(8);
  });

  it("keeps Open now at hand and opens opening hours before secondary filter groups", async () => {
    mocks.params = new URLSearchParams();
    await render(root, <ExploreClient initialActivities={activities} />);
    await click(button(container, "Experiences"));

    expect(button(container, "Open now").getAttribute("aria-pressed")).toBe("false");
    await click(button(container, "Open now"));
    expect(button(container, "Open now").getAttribute("aria-pressed")).toBe("true");

    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent?.startsWith("More filters") === true));
    const groups = findElements(container, (element) => element.tagName === "DETAILS");
    expect(groups).toHaveLength(4);
    expect(groups[0].hasAttribute("open")).toBe(true);
    expect(groups.slice(1).every((group) => !group.hasAttribute("open"))).toBe(true);
    expect(findOne(container, (element) => element.tagName === "SUMMARY" && element.textContent === "Opening hours")).not.toBeNull();
  });

  it("rejects invalid maximum prices without applying them, while accepting a valid amount", async () => {
    mocks.params = new URLSearchParams("priceMax=100");
    await render(root, <ExploreClient initialActivities={activities} />);
    await click(button(container, "Experiences"));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent?.startsWith("More filters") === true));
    await click(findOne(container, (element) => element.tagName === "SUMMARY" && element.textContent === "Location and budget"));
    const priceInput = labelled(container, "Maximum price");
    mocks.searchActivities.mockClear();

    await setInputValue(priceInput, "-100");
    expect(priceInput.getAttribute("aria-invalid")).toBe("true");
    expect(findOne(container, (element) => element.getAttribute("role") === "alert").textContent).toBe("Enter a value between 0 and 10,000.");
    expect(mocks.searchActivities).not.toHaveBeenCalled();
    expect(mocks.searchActivities.mock.calls.some(([query]) => query.priceMax === -100)).toBe(false);

    await setInputValue(priceInput, "10001");
    expect(priceInput.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.searchActivities.mock.calls.some(([query]) => query.priceMax === 10001)).toBe(false);

    await setInputValue(priceInput, "200");
    expect(priceInput.getAttribute("aria-invalid")).toBe("false");
    expect(findElements(container, (element) => element.getAttribute("role") === "alert")).toHaveLength(0);
    expect(mocks.filterComputedActivities).toHaveBeenLastCalledWith(expect.objectContaining({ priceMax: 200 }), activities);
  });

  it("maps the Hidden Gem category card to the badge flag instead of an invalid category branch", async () => {
    mocks.params = new URLSearchParams();
    await render(root, <ExploreClient initialActivities={activities} />);
    await click(button(container, "Experiences"));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent?.startsWith("More filters") === true));

    const hiddenGemCategory = findElements(container, (element) => element.tagName === "BUTTON" && element.textContent === "Hidden Gem")[0];
    await click(hiddenGemCategory);
    expect(String(mocks.replace.mock.lastCall?.[0])).toContain("hiddenGem=1");
    expect(String(mocks.replace.mock.lastCall?.[0])).not.toContain("category=hidden_gem");

    await click(hiddenGemCategory);
    expect(String(mocks.replace.mock.lastCall?.[0])).not.toContain("hiddenGem=1");
  });

  it("debounces only text search requests and sends its trimmed value", async () => {
    mocks.params = new URLSearchParams();
    await render(root, <ExploreClient initialActivities={activities} />);
    mocks.searchActivities.mockClear();
    mocks.filterComputedActivities.mockClear();
    await click(button(container, "Experiences"));
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_001);

    await setInputValue(labelled(container, "Search"), "  rain forest  ");
    expect(mocks.searchActivities).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(mocks.searchActivities).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.searchActivities).toHaveBeenCalledTimes(1);
    expect(mocks.searchActivities).toHaveBeenLastCalledWith(expect.objectContaining({ q: "rain forest" }));
    expect(mocks.filterComputedActivities).not.toHaveBeenCalled();
  });
});
