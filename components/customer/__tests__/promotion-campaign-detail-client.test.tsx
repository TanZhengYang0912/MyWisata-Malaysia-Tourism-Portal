import type { ReactNode } from "react";
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { PromotionCampaignPublic, PromotionCampaignPublicLocation, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${Object.values(values).join(" ")}` : ""}`,
    i18n: { resolvedLanguage: "en" },
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("@/components/customer/customer-page-shell", () => ({
  CustomerPageHeader: ({ title, actions, className }: { title: ReactNode; actions?: ReactNode; className?: string }) => <header className={className}><h1>{title}</h1>{actions}</header>,
  CustomerPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children: ReactNode }) => asChild ? children : <button {...props}>{children}</button>,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import { PromotionCampaignDetailClient } from "@/app/customer/events/[slug]/promotion-campaign-detail-client";

let document: TestDocument;
let container: TestElement;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
const replaceState = vi.fn();

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

async function render(campaign: PromotionCampaignPublic | null, initialError: "load" | "missing" | null = null) {
  await act(async () => {
    root?.render(<PromotionCampaignDetailClient slug={campaign?.slug ?? "demo"} initialCampaign={campaign} initialError={initialError} />);
    await flush();
  });
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await flush();
  });
}

const stepButtons = () => findElements(container, (element) => element.tagName === "BUTTON" && element.hasAttribute("aria-pressed"));
const pressedStep = () => stepButtons().find((button) => button.getAttribute("aria-pressed") === "true");
const stalls = () => findElements(container, (element) => element.tagName === "LI" && element.hasAttribute("data-phase"));
const stallNames = () => stalls().map((stall) => findOne(stall, (element) => element.tagName === "A").textContent);
const stepFor = (name: string) => findOne(container, (element) => element.tagName === "BUTTON" && element.hasAttribute("aria-pressed") && element.textContent.includes(name));

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
  const scope = window as unknown as Record<string, unknown>;
  scope.location = { href: "http://localhost/customer/events/demo-popup-fiesta" };
  scope.history = { replaceState };
  scope.matchMedia = () => ({ matches: false });
  scope.getComputedStyle = () => ({ getPropertyValue: () => "68px" });
  (globalThis as Record<string, unknown>).getComputedStyle = scope.getComputedStyle;
  (Object.getPrototypeOf(document.body) as Record<string, unknown>).scrollIntoView = () => {};
  // 2026-10-20 noon in Malaysia: Bangsar has ended, Mont Kiara is running, Heritage is upcoming.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00+08:00"));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  navigation.searchParams = new URLSearchParams();
  replaceState.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.removeChild(container);
  vi.unstubAllGlobals();
});

const location = (id: string, name: string, startsOn: string, endsOn: string, address: string | null = `${name}, Kuala Lumpur`): PromotionCampaignPublicLocation => ({
  id, name, address, lat: 3.1, lng: 101.6, startsOn, endsOn, opensAt: "10:00", closesAt: "22:00",
});

const bangsar = location("loc-bangsar", "Bangsar", "2026-10-01", "2026-10-05");
const montKiara = location("loc-mont-kiara", "Mont Kiara", "2026-10-18", "2026-10-25");
const heritage = location("loc-heritage", "Heritage Quarter", "2026-11-10", "2026-11-14");

const stall = (registrationId: string, locationId: string, products: PromotionCampaignPublicVendor["stalls"][number]["products"] = []) => ({
  registrationId, locationId, stallNumber: "A1", stallDescription: "", stallPosterUrl: "https://example.test/stall.jpg", products,
});

const touringVendor: PromotionCampaignPublicVendor = {
  vendorId: "vendor-nasi-lemak",
  vendorName: "Nasi Lemak Corner",
  vendorLogoUrl: null,
  vendorKind: "shop",
  stalls: [
    stall("reg-bangsar", bangsar.id),
    stall("reg-mont-kiara", montKiara.id, [
      { id: "p1", name: "Water", kind: "product", price: 0, imageUrl: null },
      { id: "p2", name: "Nasi Lemak", kind: "product", price: 12, imageUrl: null },
      { id: "p3", name: "Teh Tarik", kind: "product", price: 4, imageUrl: null },
    ]),
    stall("reg-heritage", heritage.id),
  ],
};

const eventVendor: PromotionCampaignPublicVendor = {
  vendorId: "vendor-fiesta-crew",
  vendorName: "Fiesta Crew",
  vendorLogoUrl: null,
  vendorKind: "event",
  stalls: [stall("reg-crew", montKiara.id)],
};

const fiesta: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "demo-popup-fiesta",
  title: "Pop-up Fiesta",
  summary: "Summary not shown on the page.",
  description: "Three stops of food and crafts.",
  posterUrl: "https://example.test/poster.jpg",
  operatingHours: "10:00 AM - 10:00 PM",
  startsAt: "2026-09-30T16:00:00.000Z",
  endsAt: "2026-11-14T15:59:00.000Z",
  visibility: "live",
  operationalStatus: "operating",
  locations: [heritage, bangsar, montKiara],
  vendors: [touringVendor, eventVendor],
};

const singleStopWith = (count: number): PromotionCampaignPublic => ({
  ...fiesta,
  locations: [montKiara],
  vendors: Array.from({ length: count }, (_, index) => ({
    ...touringVendor,
    vendorId: `vendor-${index + 1}`,
    vendorName: `Vendor ${String(index + 1).padStart(2, "0")}`,
    stalls: [stall(`reg-${index + 1}`, montKiara.id)],
  })),
});

describe("PromotionCampaignDetailClient overview", () => {
  it("renders the eyebrow, title, meta line and About in the left column", async () => {
    await render(fiesta);
    const overview = findOne(container, (element) => element.getAttribute("data-slot") === "campaign-overview");

    expect(overview.textContent).toContain("ui.promotionCampaigns.eyebrow");
    expect(findOne(overview, (element) => element.tagName === "H1").textContent).toContain("Pop-up Fiesta");
    expect(overview.textContent).toContain("ui.promotionCampaigns.operating");
    expect(overview.textContent).toContain("ui.promotionCampaigns.locationCount 3");
    expect(overview.textContent).toContain("ui.promotionCampaigns.about");
    expect(overview.textContent).toContain("Three stops of food and crafts.");
    expect(overview.textContent).not.toContain(fiesta.summary);
    expect(findElements(overview, (element) => element.tagName === "IMG" && element.getAttribute("src") === fiesta.posterUrl)).toHaveLength(1);
    expect(findElements(overview, (element) => element.getAttribute("viewBox") === "0 0 444 46")).toHaveLength(1);
  });

  it("hides the poster and the string of lights without a poster", async () => {
    await render({ ...fiesta, posterUrl: null });
    const overview = findOne(container, (element) => element.getAttribute("data-slot") === "campaign-overview");

    expect(findElements(overview, (element) => element.tagName === "IMG")).toHaveLength(0);
    expect(findElements(overview, (element) => element.getAttribute("viewBox") === "0 0 444 46")).toHaveLength(0);
  });

  it("shows the upcoming notice for an upcoming campaign", async () => {
    await render({ ...fiesta, visibility: "upcoming", operationalStatus: "upcoming" });
    expect(container.textContent).toContain("ui.promotionCampaigns.upcomingNotice");
  });

  it("keeps the poster reveal one-shot and turns it off for reduced motion", () => {
    const css = readFileSync(resolve(process.cwd(), "app/customer/events/[slug]/promotion-campaign-detail.module.css"), "utf8");
    const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(css).toMatch(/animation:\s*poster-reveal [^;]*both/);
    expect(css).not.toMatch(/animation:[^;]*infinite/);
    expect(reducedMotion).toContain(".posterImage");
    expect(reducedMotion).toContain("animation: none");
  });

  it("scrolls the stepper sideways from four stops with the dotted line across every stop", () => {
    const css = readFileSync(resolve(process.cwd(), "app/customer/events/[slug]/promotion-campaign-detail.module.css"), "utf8");
    const scrolling = css.slice(css.indexOf(".stepper:has(> li:nth-child(4)) {"));
    const line = css.slice(css.indexOf(".stepper::before"), css.indexOf("}", css.indexOf(".stepper::before")));

    expect(scrolling).toMatch(/^[^}]*overflow-x: auto/);
    expect(scrolling).toMatch(/^[^}]*max\(120px, calc\(100% \/ 3\.5\)\)/);
    expect(css).not.toContain("nth-child(5)");
    expect(line).toContain("grid-column: 1 / -1");
  });
});

describe("PromotionCampaignDetailClient stops", () => {
  it("lists stops in date order and selects the running stop by default", async () => {
    await render(fiesta);

    expect(stepButtons().map((button) => button.textContent)).toEqual([
      expect.stringContaining("Bangsar"),
      expect.stringContaining("Mont Kiara"),
      expect.stringContaining("Heritage Quarter"),
    ]);
    expect(pressedStep()?.textContent).toContain("Mont Kiara");
    expect(stepFor("Bangsar").textContent).toContain("ui.promotionCampaigns.locationEnded");
    expect(stepFor("Mont Kiara").textContent).toContain("ui.promotionCampaigns.live");
    expect(stepFor("Heritage Quarter").textContent).toContain("ui.promotionCampaigns.upcoming");
    expect(stallNames()).toEqual(["Fiesta Crew", "Nasi Lemak Corner"]);
  });

  it("starts on the stop named in ?stop and ignores an unknown id", async () => {
    navigation.searchParams = new URLSearchParams({ stop: bangsar.id });
    await render(fiesta);
    expect(pressedStep()?.textContent).toContain("Bangsar");

    act(() => root?.unmount());
    root = createRoot(container as unknown as Element);
    navigation.searchParams = new URLSearchParams({ stop: "missing-stop" });
    await render(fiesta);
    expect(pressedStep()?.textContent).toContain("Mont Kiara");
  });

  it("falls back to the next upcoming stop, then the last stop", async () => {
    await render({ ...fiesta, locations: [bangsar, heritage] });
    expect(pressedStep()?.textContent).toContain("Heritage Quarter");

    act(() => root?.unmount());
    root = createRoot(container as unknown as Element);
    await render({ ...fiesta, locations: [bangsar, { ...montKiara, startsOn: "2026-10-06", endsOn: "2026-10-07" }] });
    expect(pressedStep()?.textContent).toContain("Mont Kiara");
  });

  it("selecting a stop writes ?stop, shows only its stalls and greys out ended booths", async () => {
    await render(fiesta);
    await click(stepFor("Bangsar"));

    expect(replaceState).toHaveBeenCalledWith(null, "", "/customer/events/demo-popup-fiesta?stop=loc-bangsar");
    expect(pressedStep()?.textContent).toContain("Bangsar");
    expect(stallNames()).toEqual(["Nasi Lemak Corner"]);
    expect(stalls().every((item) => item.getAttribute("data-phase") === "ended")).toBe(true);
  });

  it("shows one location without a stepper, and the empty states", async () => {
    await render({ ...fiesta, locations: [{ ...montKiara, address: null }] });
    expect(stepButtons()).toHaveLength(0);
    expect(container.textContent).toContain("ui.promotionCampaigns.locationsSection 1");
    expect(container.textContent).toContain("ui.promotionCampaigns.addressTba");

    act(() => root?.unmount());
    root = createRoot(container as unknown as Element);
    await render({ ...fiesta, locations: [] });
    expect(container.textContent).toContain("ui.promotionCampaigns.noVendors");

    act(() => root?.unmount());
    root = createRoot(container as unknown as Element);
    await render({ ...fiesta, vendors: [] });
    expect(container.textContent).toContain("ui.promotionCampaigns.noStallsAtStop");
  });
});

describe("PromotionCampaignDetailClient stall booths", () => {
  it("links a booth to its stall page with two menu lines, Free for zero and the event badge only for event vendors", async () => {
    await render(fiesta);
    const [crew, nasiLemak] = stalls();

    expect(findOne(nasiLemak, (element) => element.tagName === "A").getAttribute("href")).toBe(`/customer/events/demo-popup-fiesta/vendor-nasi-lemak?stop=${montKiara.id}`);
    const menuLines = findElements(nasiLemak, (element) => element.tagName === "LI");
    expect(menuLines).toHaveLength(2);
    expect(menuLines[0].textContent).toContain("ui.reserve.free");
    expect(menuLines[1].textContent).toContain("RM12.00");
    expect(nasiLemak.textContent).toContain("ui.promotionCampaigns.productCount 3");
    expect(nasiLemak.textContent).not.toContain("ui.eventPartners.badge");
    expect(crew.textContent).toContain("ui.eventPartners.badge");
  });

  it("shows six booths per page and pages through the rest", async () => {
    await render(singleStopWith(7));

    expect(stalls()).toHaveLength(6);
    expect(findElements(container, (element) => element.tagName === "NAV" && element.getAttribute("aria-label") === "ui.promotionCampaigns.stallPages")).toHaveLength(1);
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "accessibility.nextPage"));
    expect(stallNames()).toEqual(["Vendor 07"]);
  });

  it("has no pager for six booths or fewer", async () => {
    await render(singleStopWith(6));

    expect(stalls()).toHaveLength(6);
    expect(findElements(container, (element) => element.tagName === "NAV" && element.getAttribute("aria-label") === "ui.promotionCampaigns.stallPages")).toHaveLength(0);
  });

  it("resets to the first page when another stop is selected", async () => {
    const campaign = singleStopWith(7);
    await render({ ...campaign, locations: [montKiara, heritage] });
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "accessibility.nextPage"));
    await click(stepFor("Heritage Quarter"));
    await click(stepFor("Mont Kiara"));

    expect(stalls()).toHaveLength(6);
  });
});

describe("PromotionCampaignDetailClient load error", () => {
  it("shows the error card and retries the fetch", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ data: { campaign: fiesta } }) }));
    vi.stubGlobal("fetch", fetchMock);
    await render(null, "load");

    expect(findOne(container, (element) => element.getAttribute("role") === "alert").textContent).toContain("ui.promotionCampaigns.loadError");
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("ui.actions.retry")));

    expect(fetchMock).toHaveBeenCalledWith("/api/customer/promotion-campaigns?slug=demo", { cache: "no-store" });
    expect(container.textContent).toContain("Pop-up Fiesta");
  });
});

describe("PromotionCampaignDetailClient copy", () => {
  it("has the new event page keys in English, Malay and Simplified Chinese", () => {
    for (const locale of ["en", "ms", "zh-CN"]) {
      const messages = JSON.parse(readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`), "utf8")) as { ui: { promotionCampaigns: Record<string, string> } };
      for (const key of ["stops", "about", "readMore", "showLess", "locationEnded", "noStallsAtStop", "stallPages"]) {
        expect(messages.ui.promotionCampaigns[key], `${locale} ${key}`).toBeTruthy();
      }
    }
  });
});
