import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key) }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/customer/product-card", () => ({ ProductCard: ({ listing }: { listing: { name: string; vendorName?: string } }) => <article data-card data-vendor={listing.vendorName}>{listing.name}</article> }));
vi.mock("@/components/shared/share-button", () => ({ ShareButton: () => <button type="button">Share</button> }));

import { VendorListingGrid } from "@/components/customer/vendor-listing-grid";
import { VendorLocationList } from "@/components/customer/vendor-location-list";
import { VendorSectionNav } from "@/components/customer/vendor-section-nav";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot>;
async function render(element: React.ReactElement) { await act(async () => { root.render(element); }); }
async function click(element: TestElement) { await act(async () => { element.dispatchEvent(new TestEvent("click", { bubbles: true })); }); }
const button = (text: string) => findOne(container, (element) => element.tagName === "BUTTON" && (element.textContent ?? "").includes(text));

const product = (index: number, productType: string | null = "activity") => ({ id: `p${index}`, vendorId: "v1", name: `Product ${index}`, description: null, productType, imageUrl: null, fromPrice: 10, requiresBooking: true, rating: 0, reviews: 0, soldAt: [] });
const location = (index: number) => ({ id: `o${index}`, name: `Outlet ${index}`, vendorName: "Kopi Co", city: "Ipoh", state: "Perak", imageUrl: null, operatingHours: null as { mon: { open: string; close: string } } | null, href: `/customer/outlets/o${index}` });

describe("vendor page sections", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T02:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container as unknown as Element); });
  afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

  it("shows eight listing cards, then the rest after Show all", async () => {
    await render(<VendorListingGrid products={Array.from({ length: 30 }, (_, index) => product(index))} returnTo="/customer/vendor/v1" />);
    expect(findElements(container, (element) => element.hasAttribute("data-card"))).toHaveLength(8);
    expect(container.textContent).toContain('ui.vendor.showingCount {"shown":8,"total":30}');
    await click(button("ui.vendor.showAllExperiences"));
    expect(findElements(container, (element) => element.hasAttribute("data-card"))).toHaveLength(30);
  });

  it("offers type chips only when the listing has two or more types, and filters by them", async () => {
    await render(<VendorListingGrid products={[product(1), product(2)]} returnTo="/" />);
    expect(container.textContent).not.toContain("ui.labels.all");
    await render(<VendorListingGrid products={[product(1), product(2, "food"), product(3, "food")]} returnTo="/" />);
    await click(button("Food & drink"));
    expect(findElements(container, (element) => element.hasAttribute("data-card")).map((card) => card.textContent)).toEqual(["Product 2", "Product 3"]);
  });

  it("shows four outlet cards, then all of them after Show all", async () => {
    await render(<VendorLocationList locations={Array.from({ length: 13 }, (_, index) => location(index))} />);
    const cards = () => findElements(container, (element) => element.hasAttribute("data-outlet-card"));
    expect(cards()).toHaveLength(4);
    await click(button("ui.vendor.showAllLocations"));
    expect(cards()).toHaveLength(13);
    expect(findElements(container, (element) => element.tagName === "A").map((link) => link.getAttribute("href"))).toContain("/customer/outlets/o12");
  });

  it("names the vendor and outlet with its location and Open now, and leaves the status out without hours", async () => {
    const open = { ...location(1), operatingHours: { mon: { open: "09:00", close: "17:00" } } };
    await render(<VendorLocationList locations={[open, location(2)]} />);
    const [first, second] = findElements(container, (element) => element.hasAttribute("data-outlet-card"));
    expect(first.textContent).toContain("Kopi Co");
    expect(first.textContent).toContain("Outlet 1");
    expect(first.textContent).toContain("Ipoh, Perak");
    expect(first.textContent).toContain("ui.operatingHours.openNow");
    expect(second.textContent).not.toContain("ui.operatingHours");
    expect(container.textContent).not.toContain("ui.vendor.directions");
  });

  it("passes the vendor name to every listing card", async () => {
    await render(<VendorListingGrid products={[product(1)]} vendorName="Kopi Co" returnTo="/" />);
    expect(findOne(container, (element) => element.hasAttribute("data-card")).getAttribute("data-vendor")).toBe("Kopi Co");
  });

  it("lists only the sections it is given, and hides with fewer than two", () => {
    const markup = renderToStaticMarkup(<VendorSectionNav items={[{ id: "about", label: "About" }, { id: "reviews", label: "Reviews (2)" }]} />);
    expect(markup.match(/<a /g)).toHaveLength(2);
    expect(markup).toContain('href="#reviews"');
    expect(renderToStaticMarkup(<VendorSectionNav items={[{ id: "about", label: "About" }]} />)).toBe("");
  });
});
