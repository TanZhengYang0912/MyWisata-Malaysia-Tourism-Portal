import React from "react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestEvent, findElements, findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  searchActivities: vi.fn(),
  searchExploreActivities: vi.fn(),
  filterComputedActivities: vi.fn((_filters: unknown, candidates: unknown[]) => candidates),
  filterExploreActivities: vi.fn((_filters: unknown, candidates: unknown[]) => candidates),
  sortExploreActivities: vi.fn((_filters: unknown, candidates: unknown[]) => candidates),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.params,
}));
vi.mock("next/link", () => ({ default: (props: { children?: React.ReactNode }) => <a {...props} /> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react");

  return {
    // The lightweight test DOM does not model Radix portals/open state; this mock keeps assertions focused on drawer content and placement.
    Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTrigger: ({ children }: { children: React.ReactElement<Record<string, unknown>> }) => React.cloneElement(children, {
      "aria-haspopup": "dialog",
      "aria-expanded": "true",
    }),
    DialogContent: ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: unknown }) => {
      return (
        <>
          <div data-testid="experience-dialog-overlay" />
          <div {...props} role="dialog" aria-modal="true" className={className}>
            {children}
          </div>
        </>
      );
    },
    DialogHeader: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <h2 {...props}>{children}</h2>,
    DialogDescription: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <p {...props}>{children}</p>,
  };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => ({
      "ui.explore.destinations": "Destinations",
      "ui.explore.experiences": "Experiences",
      "ui.discovery.state": "State",
      "ui.discovery.types": "Types",
      "ui.discovery.badges": "Badges",
      "ui.discovery.maximumPrice": "Maximum price",
      "ui.discovery.priceInvalid": "Enter a value between 0 and 10,000.",
      "ui.discovery.freeOnly": "Free entry",
      "ui.discovery.bookableOnly": "Booking required",
      "ui.discovery.hiddenGemOnly": "Hidden Gem",
      "ui.discovery.familyFriendlyOnly": "Family Friendly",
      "ui.discovery.coupleFriendlyOnly": "Couple Friendly",
      "ui.discovery.showAll": `Show all (${options?.count ?? ""})`,
      "categories.activity": "Activity",
      "categories.food": "Food",
      "categories.accommodation": "Accommodation",
      "categories.retail": "Retail",
      "categories.hiddenGem": "Hidden Gem",
      "ui.discovery.searchLabel": "Search",
      "ui.search.category": "Categories",
      "ui.map.allCategories": "All Categories",
      "ui.explore.sortBy": "Sort by",
      "ui.explore.sortRecommended": "Recommended",
      "ui.explore.sortPriceAsc": "Price: Low to High",
      "ui.explore.sortRatingDesc": "Top Rated",
      "ui.discovery.openingHours": "Opening hours",
      "ui.discovery.locationAndPrice": "Location and budget",
      "ui.discovery.experienceTypes": "Activity types",
      "ui.discovery.preferences": "Preferences",
      "ui.explore.emptyExperienceFilters": "Try another category or clear your filters.",
      "ui.explore.filters": "Filters",
      "ui.explore.filterDrawerTitle": "Filter experiences",
      "ui.explore.filterDrawerDescription": "Narrow the listings by state, category, type, and features.",
      "ui.explore.showExperienceResults": "Show results",
      "ui.labels.openNow": "Open now",
      "ui.map.moreFilters": "More filters",
      "ui.map.activeFilters": "Active filters",
      "ui.actions.close": "Close",
      "ui.map.types.nature": "Nature",
      "ui.map.types.chinese": "Chinese",
      "ui.map.types.resort": "Resort",
      "ui.pagination.experiencePages": "Experience pages",
      "ui.pagination.experienceItems": "experiences",
    } as Record<string, string>)[key] ?? key,
  }),
}));
vi.mock("@/backend/domains/catalogue", () => ({
  CATEGORIES: [
    { id: "activity", labelKey: "categories.activity" },
    { id: "food", labelKey: "categories.food" },
    { id: "accommodation", labelKey: "categories.accommodation" },
    { id: "retail", labelKey: "categories.retail" },
    { id: "hidden_gem", labelKey: "categories.hiddenGem" },
  ],
  STATES_MY: ["All Malaysia", "Sabah"],
  searchActivities: mocks.searchActivities,
  searchExploreActivities: mocks.searchExploreActivities,
  filterComputedActivities: mocks.filterComputedActivities,
  filterExploreActivities: mocks.filterExploreActivities,
  sortExploreActivities: mocks.sortExploreActivities,
}));
vi.mock("@/components/customer/activity-card", () => ({ ActivityCard: ({ activity, listing, returnTo, hideDiscoveryBadges }: { activity?: { id: string; name: string }; listing?: { id: string; name: string }; returnTo?: string; hideDiscoveryBadges?: boolean }) => { const item = (activity ?? listing)!; return <article data-testid={`activity-${item.id}`} data-card={listing ? "catalogue" : "discovery"} data-hide-discovery-badges={hideDiscoveryBadges ? "true" : "false"}>{item.name}|{returnTo}</article>; } }));
vi.mock("@/components/demo-map/story-map", () => ({ StoryMap: ({ activities }: { activities: { id: string }[] }) => <output data-testid="story-map-ids">{activities.map((activity) => activity.id).join(",")}</output> }));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
    ...props
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    [key: string]: unknown;
  }) => React.createElement("button", {
    ...props,
    id,
    type: "button",
    role: "checkbox",
    "aria-checked": checked ? "true" : "false",
    onClick: () => onCheckedChange?.(!checked),
  }),
}));

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

function checkbox(container: TestElement, label: string) {
  return findOne(container, (element) => element.getAttribute("role") === "checkbox" && element.getAttribute("aria-label") === label);
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

async function setSelectValue(select: TestElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), "value")?.set;
  setter?.call(select, value);
  await act(async () => {
    select.dispatchEvent(new TestEvent("change", { bubbles: true }));
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
    mocks.params = new URLSearchParams("tab=experiences&state=Sabah&category=activity&type=activity%3Anature&priceMax=100&free=1&bookable=1&hiddenGem=1&family=1&couple=1");
    mocks.replace.mockReset().mockImplementation((href: string) => {
      mocks.params = new URL(href, "https://mylawatan.test").searchParams;
    });
    mocks.searchActivities.mockReset().mockResolvedValue(activities);
    mocks.searchExploreActivities.mockReset().mockResolvedValue(activities);
    mocks.filterComputedActivities.mockReset().mockImplementation((_filters, candidates) => candidates);
    mocks.filterExploreActivities.mockReset().mockImplementation((_filters, candidates) => candidates);
    mocks.sortExploreActivities.mockReset().mockImplementation((_filters, candidates) => candidates);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("keeps supported facets, removes hidden legacy filters, and presents a compact Experiences toolbar", async () => {
    await render(root, <ExploreClient initialActivities={activities} />);
    expect(mocks.searchExploreActivities).toHaveBeenCalledWith(expect.objectContaining({
      q: "", state: "Sabah", categories: ["activity"], types: ["activity:nature"], priceMax: null,
      operatingDays: [], hoursMode: "during", timeAt: null,
      timeFrom: null, timeTo: null,
      overnight: false, openNow: false,
      freeOnly: false, bookableOnly: false, hiddenGemOnly: true, familyFriendlyOnly: true, coupleFriendlyOnly: true,
    }));
    expect(mocks.searchActivities).not.toHaveBeenCalled();
    expect(mocks.filterComputedActivities).not.toHaveBeenCalled();

    const experiencesUrl = new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test");
    expect(experiencesUrl.searchParams.get("tab")).toBe("experiences");
    expect(experiencesUrl.searchParams.getAll("category")).toEqual(["activity"]);
    expect(experiencesUrl.searchParams.getAll("type")).toEqual(["activity:nature"]);
    expect(experiencesUrl.searchParams.get("hiddenGem")).toBe("1");
    expect(experiencesUrl.searchParams.get("family")).toBe("1");
    expect(experiencesUrl.searchParams.get("couple")).toBe("1");
    for (const stale of ["priceMax", "free", "bookable", "hoursDay", "timeAt", "timeFrom", "timeTo", "overnight"]) {
      expect(experiencesUrl.searchParams.has(stale)).toBe(false);
    }
    expect(labelled(container, "State").value).toBe("Sabah");
    expect(checkbox(container, "Activity").getAttribute("aria-checked")).toBe("true");
    for (const label of ["Hidden Gem", "Family Friendly", "Couple Friendly"]) expect(findElements(container, (element) => element.getAttribute("aria-label") === label)).toHaveLength(0);
    for (const label of ["Maximum price", "Free entry", "Booking required", "Opening hours"]) expect(findElements(container, (element) => element.getAttribute("aria-label") === label)).toHaveLength(0);
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false)).toHaveLength(8);
    const activityCard = findOne(container, (element) => element.getAttribute("data-testid") === "activity-result-1");
    expect(activityCard.getAttribute("data-card")).toBe("catalogue");
    const toolbar = findOne(container, (element) => element.getAttribute("data-testid") === "experience-toolbar");
    expect(findElements(toolbar, (element) => element.tagName === "INPUT" && element.getAttribute("aria-label") === "Search")).toHaveLength(1);
    expect(findElements(toolbar, (element) => element.tagName === "SELECT" && element.getAttribute("aria-label") === "Sort by")).toHaveLength(1);
    expect(findElements(container, (element) => element.textContent === "All Experiences")).toHaveLength(0);
    expect(findElements(container, (element) => /\b\d+\s+results\b/i.test(element.textContent ?? ""))).toHaveLength(0);
  });

  it("shows one removable chip per applied facet and counts them on the Filters trigger", async () => {
    await render(root, <ExploreClient initialActivities={activities} />);
    const chipRow = findOne(container, (element) => element.getAttribute("data-testid") === "experience-active-filters");
    const chips = findElements(chipRow, (element) => element.getAttribute("aria-label") === "ui.discovery.removeFilter");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Sabah", "Activity", "Nature", "Hidden Gem", "Family Friendly", "Couple Friendly"]);
    expect(findOne(container, (element) => element.getAttribute("data-testid") === "experience-filter-trigger").textContent).toBe("Filters6");

    await click(chips[0]);
    const url = new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test");
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.getAll("category")).toEqual(["activity"]);
    expect(findOne(container, (element) => element.getAttribute("data-testid") === "experience-filter-trigger").textContent).toBe("Filters5");
  });

  it("shows the unfiltered default view in the default Explore order, not the cached popularity order", async () => {
    mocks.params = new URLSearchParams("tab=experiences");
    mocks.sortExploreActivities.mockImplementation((_filters, candidates) => [...candidates].reverse());
    await render(root, <ExploreClient initialActivities={activities} />);
    expect(mocks.sortExploreActivities).toHaveBeenCalledWith({}, activities);
    const ids = findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false).map((element) => element.getAttribute("data-testid"));
    expect(ids[0]).toBe("activity-result-10");
  });

  it("restores the Experiences tab from the URL", async () => {
    mocks.params = new URLSearchParams("tab=experiences");
    await render(root, <ExploreClient initialActivities={activities} />);

    expect(findElements(container, (element) => element.getAttribute("data-testid") === "story-map-ids").length).toBe(0);
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false)).toHaveLength(8);
  });

  it("keeps the selected tab and current filters in the product return URL", async () => {
    mocks.params = new URLSearchParams("state=Sabah");
    await render(root, <ExploreClient initialActivities={activities} />);
    await click(button(container, "Experiences"));
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open now"));

    const currentUrl = new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test");
    expect(currentUrl.searchParams.get("tab")).toBe("experiences");
    expect(currentUrl.searchParams.get("state")).toBe("Sabah");
    expect(currentUrl.searchParams.get("openNow")).toBe("1");

    const activityCard = findOne(container, (element) => element.getAttribute("data-testid") === "activity-result-1");
    const returnTo = new URL(activityCard.textContent?.split("|").at(-1) ?? "", "https://mylawatan.test");
    expect(returnTo.pathname).toBe("/customer/explore");
    expect(returnTo.searchParams.get("tab")).toBe("experiences");
    expect(returnTo.searchParams.get("state")).toBe("Sabah");
    expect(returnTo.searchParams.get("openNow")).toBe("1");
  });

  it("writes the selected page to the URL and restores its listings and detail return URL", async () => {
    mocks.params = new URLSearchParams("tab=experiences");
    await render(root, <ExploreClient initialActivities={activities} />);

    await click(labelled(container, "accessibility.nextPage"));

    const pageUrl = new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test");
    expect(pageUrl.searchParams.get("tab")).toBe("experiences");
    expect(pageUrl.searchParams.get("page")).toBe("2");
    await render(root, <ExploreClient initialActivities={activities} />);

    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false).map((element) => element.getAttribute("data-testid"))).toEqual([
      "activity-result-9",
      "activity-result-10",
    ]);
    const returnTo = new URL(findOne(container, (element) => element.getAttribute("data-testid") === "activity-result-9").textContent?.split("|").at(-1) ?? "", "https://mylawatan.test");
    expect(returnTo.searchParams.get("page")).toBe("2");
  });

  it("resets to the first page after a filter or sort change", async () => {
    mocks.params = new URLSearchParams("tab=experiences&page=2");
    await render(root, <ExploreClient initialActivities={activities} />);

    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false).length).toBe(2);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open now"));
    expect(new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test").searchParams.has("page")).toBe(false);
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false).length).toBe(8);

    await click(labelled(container, "accessibility.nextPage"));
    await setSelectValue(labelled(container, "Sort by"), "price_asc");
    expect(new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test").searchParams.get("sort")).toBe("price_asc");
    expect(new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test").searchParams.has("page")).toBe(false);
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false).length).toBe(8);
  });

  it("clamps out-of-range page values to the last available page", async () => {
    mocks.params = new URLSearchParams("tab=experiences&page=99");
    await render(root, <ExploreClient initialActivities={activities} />);

    expect(new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test").searchParams.get("page")).toBe("2");
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false).length).toBe(2);
  });

  it("uses one right-side filter dialog at every viewport", async () => {
    mocks.params = new URLSearchParams("tab=experiences");
    await render(root, <ExploreClient initialActivities={activities} />);

    expect(findElements(container, (element) => element.tagName === "ASIDE")).toHaveLength(0);
    const toolbar = findOne(container, (element) => element.getAttribute("data-testid") === "experience-toolbar");
    const filterToggle = findOne(toolbar, (element) => element.getAttribute("data-testid") === "experience-filter-trigger");
    expect(filterToggle.getAttribute("aria-haspopup")).toBe("dialog");
    expect(filterToggle.getAttribute("aria-expanded")).toBe("true");
    expect(filterToggle.getAttribute("class") ?? "").not.toContain("lg:hidden");
    expect(findElements(toolbar, (element) => element.tagName === "INPUT" && element.getAttribute("aria-label") === "Search")).toHaveLength(1);
    expect(findElements(toolbar, (element) => element.tagName === "SELECT" && element.getAttribute("aria-label") === "Sort by")).toHaveLength(1);

    const dialog = findOne(container, (element) => element.getAttribute("role") === "dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("experience-filter-title");
    const dialogClassName = dialog.getAttribute("class") ?? "";
    expect(dialogClassName).toContain("right-0");
    expect(dialogClassName).toContain("h-dvh");
    expect(dialogClassName).toContain("max-w-[430px]");
    expect(dialogClassName).not.toContain("left-1/2");

    expect(findOne(container, (element) => element.getAttribute("data-testid") === "experience-dialog-overlay")).not.toBeNull();
  });

  it("keeps Open Now as a toggle button and starts category/type/badge groups collapsed", async () => {
    mocks.params = new URLSearchParams();
    await render(root, <ExploreClient initialActivities={activities} />);
    await click(button(container, "Experiences"));
    const openNow = findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "Open now");
    expect(openNow.textContent).toContain("Open now");
    expect(findElements(container, (element) => element.getAttribute("role") === "checkbox" && element.getAttribute("aria-label") === "Open now")).toHaveLength(0);
    await click(openNow);
    expect(findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-pressed") === "true").textContent).toContain("Open now");

    const typeGroups = findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("experience-type-toggle-") ?? false);
    expect(typeGroups).toHaveLength(4);
    expect(typeGroups.every((group) => group.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(findOne(container, (element) => element.getAttribute("data-testid") === "experience-badges-toggle").getAttribute("aria-expanded")).toBe("false");
    for (const label of ["Hidden Gem", "Family Friendly", "Couple Friendly"]) expect(findElements(container, (element) => element.getAttribute("aria-label") === label)).toHaveLength(0);
    await click(findOne(container, (element) => element.getAttribute("data-testid") === "experience-badges-toggle"));
    for (const label of ["Hidden Gem", "Family Friendly", "Couple Friendly"]) expect(checkbox(container, label)).not.toBeNull();
  });

  it("keeps type filters visible as checkboxes after opening a category group", async () => {
    mocks.params = new URLSearchParams("tab=experiences");
    await render(root, <ExploreClient initialActivities={activities} />);
    await click(findOne(container, (element) => element.getAttribute("data-testid") === "experience-type-toggle-food"));
    expect(checkbox(container, "Chinese")).not.toBeNull();
    expect(checkbox(container, "Food")).not.toBeNull();
    expect(findElements(container, (element) => element.getAttribute("aria-label") === "Hidden Gem")).toHaveLength(0);
  });

  it("sorts the product grid and preserves the selected sort when returning from a detail page", async () => {
    mocks.params = new URLSearchParams("tab=experiences");
    await render(root, <ExploreClient initialActivities={activities} />);

    await setSelectValue(labelled(container, "Sort by"), "price_asc");

    const sortedUrl = new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test");
    expect(sortedUrl.searchParams.get("sort")).toBe("price_asc");
    expect(mocks.filterExploreActivities).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "price_asc", categories: [] }), expect.any(Array));
    const activityCard = findOne(container, (element) => element.getAttribute("data-testid") === "activity-result-1");
    const returnTo = new URL(activityCard.textContent?.split("|").at(-1) ?? "", "https://mylawatan.test");
    expect(returnTo.searchParams.get("tab")).toBe("experiences");
    expect(returnTo.searchParams.get("sort")).toBe("price_asc");
  });

  it("keeps supported type and badge URL filters on Experiences while removing disabled filters", async () => {
    mocks.params = new URLSearchParams("tab=experiences&category=hidden_gem&type=activity%3Anature&hiddenGem=1&family=1&couple=1&free=1&bookable=1&priceMax=50&hoursDay=mon&timeAt=10%3A00");
    await render(root, <ExploreClient initialActivities={activities} />);

    expect(mocks.searchExploreActivities).toHaveBeenCalledWith(expect.objectContaining({
      categories: ["activity"],
      types: ["activity:nature"],
      hiddenGemOnly: true,
      familyFriendlyOnly: true,
      coupleFriendlyOnly: true,
      freeOnly: false,
      bookableOnly: false,
      priceMax: null,
      operatingDays: [],
      timeAt: null,
    }));
    const experiencesUrl = new URL(String(mocks.replace.mock.lastCall?.[0]), "https://mylawatan.test");
    expect(experiencesUrl.searchParams.getAll("category")).toEqual(["activity"]);
    expect(experiencesUrl.searchParams.getAll("type")).toEqual(["activity:nature"]);
    expect(experiencesUrl.searchParams.get("hiddenGem")).toBe("1");
    expect(experiencesUrl.searchParams.get("family")).toBe("1");
    expect(experiencesUrl.searchParams.get("couple")).toBe("1");
    for (const stale of ["free", "bookable", "priceMax", "hoursDay", "timeAt"]) expect(experiencesUrl.searchParams.has(stale)).toBe(false);
    expect(findElements(container, (element) => element.getAttribute("data-testid")?.startsWith("activity-") ?? false)).toHaveLength(8);
  });

  it("debounces only text search requests and sends its trimmed value", async () => {
    mocks.params = new URLSearchParams();
    await render(root, <ExploreClient initialActivities={activities} />);
    mocks.searchActivities.mockClear();
    mocks.searchExploreActivities.mockClear();
    mocks.filterComputedActivities.mockClear();
    mocks.filterExploreActivities.mockClear();
    await click(button(container, "Experiences"));
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_001);

    await setInputValue(labelled(container, "Search"), "  rain forest  ");
    expect(mocks.searchExploreActivities).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(mocks.searchExploreActivities).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.searchExploreActivities).toHaveBeenCalledTimes(1);
    expect(mocks.searchExploreActivities).toHaveBeenLastCalledWith(expect.objectContaining({ q: "rain forest" }));
    expect(mocks.filterComputedActivities).not.toHaveBeenCalled();
    expect(mocks.filterExploreActivities).not.toHaveBeenCalled();
  });

  it("shows the localized loading error instead of claiming the catalogue is empty during an outage", async () => {
    mocks.params = new URLSearchParams();
    await render(root, <ExploreClient initialActivities={[]} dataUnavailable />);

    expect(findOne(container, (element) => element.getAttribute("role") === "status").textContent).toBe("ui.states.loadingError");
    expect(findElements(container, (element) => element.textContent === "ui.explore.noExperiences")).toHaveLength(0);
  });
});
