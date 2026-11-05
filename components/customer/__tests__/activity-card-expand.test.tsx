import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  translations: {
    "ui.actions.viewDetails": "View Details",
    "ui.actions.bookNow": "Book Now",
    "ui.actions.buyNow": "Buy Now",
    "ui.property.seeRooms": "See Rooms",
    "ui.labels.person": "person",
    "ui.activityDetail.priceUnits.perNight": "per night",
    "categories.activity": "Activity",
    "ui.labels.closed": "Closed",
    "ui.labels.verified": "Verified",
    "ui.labels.trending": "Trending",
    "ui.labels.accessible": "Accessible",
    "ui.activity.noReviewsYet": "No reviews yet",
  } as Record<string, string>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => mocks.translations[key] ?? key }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("lucide-react", () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />;
  return { Accessibility: Icon, BedDouble: Icon, CheckCircle: Icon, Clock: Icon, Clock3: Icon, ImageOff: Icon, Info: Icon, MapPin: Icon, Star: Icon, Store: Icon, XIcon: Icon };
});
vi.mock("@/components/providers/wishlist", () => ({
  useOptionalWishlist: () => ({}),
  useWishlist: () => ({ savedIds: new Set<string>(), savedOutletIds: new Set<string>(), toggleSaved: vi.fn(), toggleSavedOutlet: vi.fn() }),
}));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => () => true }));
vi.mock("@/components/customer/localized-content", () => ({
  LocalizedContent: ({ sourceText, children }: { sourceText: string; children: (value: { text: string; control: null; pending: false }) => React.ReactNode }) => <>{children({ text: sourceText, control: null, pending: false })}</>,
}));
vi.mock("@/components/customer/category-icon", () => ({ CategoryIcon: () => null }));
vi.mock("@/components/customer/operating-hours-summary", () => ({ OperatingHoursSummary: () => null }));
vi.mock("@/components/customer/save-toggle-button", () => ({ SaveToggleButton: ({ saved: _saved, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { saved: boolean }) => <button {...props}>{children}</button> }));
vi.mock("@/components/shared/share-button", () => ({ ShareButton: () => null }));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: ({ amountMYR, className }: { amountMYR: number; className?: string }) => <span data-testid="activity-card-price" className={className}>{amountMYR}</span> }));

import { ActivityCard } from "@/components/customer/activity-card";
import { findElements } from "@/components/shared/__tests__/render-test-dom";

const activity = {
  id: "activity-1",
  name: "Rafflesia Trail Guide",
  image: "",
  category: "Activity",
  categorySlug: "activity",
  price: 180,
  rating: 4.5,
  reviews: 4,
  duration: "Half day",
  requiresBooking: true,
  outlet: {
    id: "outlet-1",
    name: "Highlands Guides",
    vendorName: "Highlands Guides",
    city: "Brinchang",
    state: "Pahang",
    open: true,
    currentlyOpen: true,
    verified: true,
    hours: "09:00–17:00",
  },
} as never;

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;

async function renderCard(item: unknown = activity) {
  await act(async () => {
    root?.render(<ActivityCard activity={item as never} />);
    await Promise.resolve();
  });
}

describe("ActivityCard expanding details", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.removeChild(container);
  });

  it("has no info button and marks the media as the keyboard-accessible mobile preview trigger", async () => {
    await renderCard();

    expect(container.textContent).toContain("Brinchang, Pahang");
    expect(() => findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "View Details")).toThrow();
    expect(() => findOne(container, (element) => element.hasAttribute("aria-haspopup"))).toThrow();
  });

  it("keeps details in the desktop drawer and the primary action in its own visible row", async () => {
    await renderCard();

    const details = findOne(container, (element) => element.getAttribute("data-card-details-inline") === "true");
    const action = findOne(container, (element) => element.getAttribute("data-card-primary-cta") === "true");
    expect(details.textContent).toContain("Brinchang, Pahang");
    expect(details.className).not.toContain("bg-primary");
    expect(action.textContent).toBe("Book Now");
    expect((action.parentNode as TestElement | null)?.className).toContain("mw-card-cta-drawer");
  });

  it("puts the price and full-width primary action in separate footer rows", async () => {
    await renderCard();

    const footer = findOne(container, (element) => element.className.includes("mw-card-footer-stacked"));
    const price = findOne(footer, (element) => element.getAttribute("data-testid") === "activity-card-price");
    const action = findOne(footer, (element) => element.getAttribute("data-card-primary-cta") === "true");
    expect((price.parentNode as TestElement | null)?.className).toContain("mw-card-price-row");
    expect((action.parentNode as TestElement | null)?.className).toContain("mw-card-cta-drawer");
    expect(action.textContent).toBe("Book Now");
    expect(action.className).toContain("w-full");
    expect(action.className).toContain("h-9");
  });

  const pills = () => {
    const heading = findOne(container, (element) => element.tagName === "H3");
    const row = (heading.parentNode as TestElement).parentNode as TestElement;
    const badgeRow = findOne(row, (element) => element.className.includes("max-h-5"));
    return findElements(badgeRow, (element) => element.tagName === "SPAN" && element.className.includes("rounded-full"));
  };

  it("shows at most three badges right under the name, Closed first, and none in the drawer", async () => {
    const outlet = (activity as unknown as { outlet: Record<string, unknown> }).outlet;
    await renderCard({ ...(activity as object), hot: true, outlet: { ...outlet, currentlyOpen: false, wheelchairAccessible: true } });

    expect(pills().map((pill) => pill.textContent?.trim())).toEqual(["Closed", "Activity", "Verified"]);
    const body = findOne(container, (element) => element.className.includes("mw-card-body"));
    const text = body.textContent ?? "";
    expect(text.indexOf("Rafflesia Trail Guide")).toBeLessThan(text.indexOf("Closed"));
    expect(text.indexOf("Verified")).toBeLessThan(text.indexOf("180"));
    const details = findOne(container, (element) => element.getAttribute("data-card-details-inline") === "true");
    expect(details.textContent).not.toContain("Verified");
    expect(details.textContent).not.toContain("(4)");
  });

  it("puts the rating under the price, or No reviews yet when there are none", async () => {
    await renderCard();
    const priceRow = findOne(container, (element) => element.className.includes("mw-card-price-row"));
    expect(priceRow.textContent).toContain("4.5");
    expect(priceRow.textContent).toContain("(4)");

    await renderCard({ ...(activity as object), reviews: 0 });
    expect(findOne(container, (element) => element.className.includes("mw-card-price-row")).textContent).toContain("No reviews yet");
  });

  it("makes the vendor listing card's save button the same 32px as its share button", async () => {
    const listing = { id: "p1", vendorId: "v1", name: "Batik class", description: null, productType: "activity", imageUrl: null, fromPrice: 50, requiresBooking: true, rating: 0, reviews: 0, soldAt: [] };
    await act(async () => { root?.render(<ActivityCard vendorListing={listing} returnTo="/customer/vendor/v1" />); });
    const save = findOne(container, (element) => element.tagName === "BUTTON");
    expect(save.className).toContain("h-8 w-8");
    expect(save.className).not.toContain("h-10");
  });
});
