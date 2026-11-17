import { act, type ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { PromotionCampaignPublic, PromotionCampaignPublicLocation } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { state?: string; count?: number; date?: string }) => options?.state !== undefined
    ? `${key} ${options.state}`
    : options?.count !== undefined ? `${key}:${options.count}` : key,
  i18n: { resolvedLanguage: "en" },
}) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/customer/localized-content", () => ({
  LocalizedContent: ({ sourceText, children }: { sourceText: string; children: (value: { text: string; control: ReactNode }) => ReactNode }) => <>{children({ text: sourceText, control: null })}</>,
}));

import { PromotionCampaignsClient } from "@/app/customer/events/promotion-campaigns-client";

const stop = (id: string, at: { lat: number; lng: number }, startsOn: string, endsOn: string): PromotionCampaignPublicLocation => ({
  id, name: `Stop ${id}`, address: null, ...at, startsOn, endsOn, opensAt: "10:00", closesAt: "22:00",
});
const KL = { lat: 3.139, lng: 101.6869 };
const IPOH = { lat: 4.5975, lng: 101.079 };
const JOHOR_BAHRU = { lat: 1.548, lng: 103.7956 };
const MELAKA = { lat: 2.1951, lng: 102.2475 };

const event = (slug: string, locations: PromotionCampaignPublicLocation[]): PromotionCampaignPublic => ({
  id: slug, slug, title: slug, summary: "", description: "", posterUrl: null, operatingHours: null,
  startsAt: `${locations[0].startsOn}T00:00:00.000Z`, endsAt: `${locations[0].endsOn}T00:00:00.000Z`,
  visibility: "live", locations, vendors: [],
});

// Today is Friday 13 November 2026 in Malaysia.
const CAMPAIGNS = [
  event("kl-market", [stop("kl", KL, "2026-11-12", "2026-11-15")]),
  event("tour", [stop("tour-kl", KL, "2026-11-10", "2026-12-31"), stop("tour-ipoh", IPOH, "2026-11-28", "2026-11-30")]),
  event("melaka-fair", [stop("melaka", MELAKA, "2026-11-20", "2026-11-22")]),
  event("jb-bazaar", [stop("jb", JOHOR_BAHRU, "2026-12-12", "2026-12-14")]),
];

describe("Events page Map view", () => {
  let createRoot: typeof import("react-dom/client").createRoot;
  let document: TestDocument;
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T06:30:00Z"));
    document = installTestDom();
    // The date filter writes ?date= with replaceState.
    Object.assign(globalThis.window, { location: { href: "http://localhost/customer/events" }, history: { replaceState: vi.fn() } });
    ({ createRoot } = await import("react-dom/client"));
  });
  afterAll(() => vi.useRealTimers());

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  const show = async (initialDate: string | null = null) => {
    await act(async () => root.render(<PromotionCampaignsClient initialCampaigns={CAMPAIGNS} initialError={false} initialDate={initialDate} />));
  };
  const click = async (element: TestElement) => { await act(async () => element.dispatchEvent(new TestEvent("click", { bubbles: true }))); };
  const byLabel = (label: string) => findOne(container, (element) => element.getAttribute("aria-label") === label);
  const viewButton = (view: "list" | "map") => findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === `ui.promotionCampaigns.views.${view}`);
  const pin = (region: string) => findOne(container, (element) => element.getAttribute("data-region") === region);
  const slugs = () => findElements(container, (element) => element.tagName === "A" && (element.getAttribute("href") ?? "").startsWith("/customer/events/"))
    .map((element) => element.getAttribute("href")!.replace("/customer/events/", ""));
  const heading = () => findOne(container, (element) => element.getAttribute("id") === "events-list-heading").textContent;
  const count = (region: string) => findOne(pin(region), (element) => element.tagName === "B").textContent;

  it("filters the list by the selected region and starts on page 1", async () => {
    await show();
    expect(findElements(container, (element) => element.getAttribute("data-region") !== null)).toHaveLength(0);
    await click(viewButton("map"));
    expect(["north", "central", "south", "east-coast", "east-malaysia"].map(count)).toEqual(["1", "2", "2", "0", "0"]);

    await click(pin("south"));
    expect(slugs()).toEqual(["melaka-fair", "jb-bazaar"]);
    expect(heading()).toBe("ui.promotionCampaigns.map.regions.south.title");
    expect(byLabel("ui.promotionCampaigns.views.label")).toBeDefined();
  });

  it("switching to List shows every event and clears the region", async () => {
    await show();
    await click(viewButton("map"));
    await click(pin("south"));
    await click(viewButton("list"));
    expect(slugs()).toEqual(["tour", "kl-market", "melaka-fair", "jb-bazaar"]);
    expect(heading()).toBe("ui.promotionCampaigns.allEvents");

    await click(viewButton("map"));
    expect(findElements(container, (element) => element.getAttribute("aria-pressed") === "true" && element.getAttribute("data-region") !== null)).toHaveLength(0);
  });

  it("counts only the stops running on a picked day", async () => {
    await show("2026-11-28");
    await click(viewButton("map"));
    expect(["north", "central", "south"].map(count)).toEqual(["1", "1", "0"]);
    expect(pin("south").getAttribute("disabled")).not.toBeNull();
  });

  it("keeps a selected region when a day leaves it empty", async () => {
    await show();
    await click(viewButton("map"));
    await click(pin("south"));
    await click(byLabel("ui.promotionCampaigns.datePicker.openCalendar"));
    await click(byLabel("Saturday, November 28, 2026"));

    expect(pin("south").getAttribute("aria-pressed")).toBe("true");
    expect(pin("south").getAttribute("disabled")).toBeNull();
    expect(slugs()).toEqual([]);
    expect(container.textContent).toContain("ui.promotionCampaigns.map.emptyStateTitle ui.promotionCampaigns.map.regions.south.title");
  });
});
