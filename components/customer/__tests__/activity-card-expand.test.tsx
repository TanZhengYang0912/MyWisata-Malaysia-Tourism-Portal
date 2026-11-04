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

async function renderCard() {
  await act(async () => {
    root?.render(<ActivityCard activity={activity} />);
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
});
