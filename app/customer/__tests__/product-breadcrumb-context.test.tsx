import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComputedActivity } from "@/backend/core/types";
import type { OutletChoice } from "@/backend/domains/catalogue";

let query = "";
const fetchMock = vi.fn();

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock("@/components/providers/cart", () => ({ useCart: () => ({ addItem: vi.fn() }) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => vi.fn() }));
vi.mock("@/components/shared/back-link", () => ({ BackLink: () => null }));
vi.mock("@/components/shared/share-button", () => ({ ShareButton: () => null }));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: () => null }));
vi.mock("@/app/customer/activity/[id]/bodies/booking-panel", () => ({ BookingPanel: () => null }));
vi.mock("@/components/customer/ai-tag", () => ({ AiTag: () => null }));
vi.mock("@/components/customer/activity-reviews", () => ({ ActivityReviews: () => null }));
vi.mock("@/components/customer/activity-card", () => ({ ActivityCard: () => null }));
vi.mock("@/components/customer/product-chat-button", () => ({ ProductChatButton: () => null }));
vi.mock("@/components/customer/product-save-button", () => ({ ProductSaveButton: () => null }));
vi.mock("@/components/customer/operating-hours-summary", () => ({ OperatingHoursSummary: () => null }));
vi.mock("@/components/customer/localized-content", () => ({ LocalizedContent: ({ sourceText }: { sourceText: string }) => <span>{sourceText}</span> }));
import { ActivityDetailClient } from "@/app/customer/activity/[id]/activity-detail-client";

function outlet(id: string, price: number): OutletChoice {
  return {
    outletId: id, outletName: `Outlet ${id}`, city: "Melaka", state: "Melaka", price, open: true, hours: "",
    verified: true, vendorId: "v1", vendorName: "Vendor One", rating: 0, reviews: 0, badgeSlugs: [], accommodationTypeSlugs: [],
  };
}

function activity(outletId = "cheap", categorySlug = "activity"): ComputedActivity {
  return {
    id: "p1", name: "Boat ride", description: "", categorySlug, image: null, price: 5, rating: 0, reviews: 0,
    variants: [], tags: [], highlights: [], includes: [], outletId,
    outlet: { id: outletId, name: `Outlet ${outletId}`, city: "Melaka", state: "Melaka", vendorId: "v1", vendorName: "Vendor One", verified: true, badgeSlugs: [], accommodationTypeSlugs: [], hours: "", open: true },
  } as unknown as ComputedActivity;
}

function render(search: string, choices: OutletChoice[], base = activity()) {
  query = search;
  return renderToStaticMarkup(<ActivityDetailClient initialActivity={base} initialSlots={[]} initialReviews={[]} outletChoices={choices} />);
}

const crumbs = (markup: string) => [...markup.matchAll(/<nav[^>]*aria-label="ui\.place\.breadcrumb"[\s\S]*?<\/nav>/g)];
const hrefs = (markup: string) => [...(crumbs(markup)[0]?.[0].matchAll(/href="([^"]+)"/g) ?? [])].map((match) => match[1]);

describe("product breadcrumb context", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows Home, Vendors, vendor, the default outlet and the product for a direct Home entry", () => {
    const markup = render("", [outlet("cheap", 5), outlet("dear", 9)]);
    expect(crumbs(markup)).toHaveLength(1);
    expect(hrefs(markup)).toEqual(["/customer", "/customer/vendors", "/customer/vendors/v1", "/customer/outlets/cheap"]);
    expect(markup).toContain("Boat ride");
  });

  it("uses the outlet named in the link when it sells the product", () => {
    expect(hrefs(render("outletId=dear", [outlet("cheap", 5), outlet("dear", 9)]))).toContain("/customer/outlets/dear");
  });

  it("falls back to the default outlet for an outlet that does not sell the product", () => {
    const trail = hrefs(render("outletId=nope", [outlet("cheap", 5), outlet("dear", 9)]));
    expect(trail).toContain("/customer/outlets/cheap");
    expect(trail.join()).not.toContain("nope");
  });

  it("selects the default outlet for a multi-outlet product reached from a vendor page, ready to buy", () => {
    const markup = render("source=vendor", [outlet("cheap", 5), outlet("dear", 9)], activity("cheap", "food"));
    expect(hrefs(markup)).toEqual(["/customer", "/customer/vendors", "/customer/vendors/v1", "/customer/outlets/cheap"]);
    expect(markup).toContain("strictMigration.activityDetail.availableAtChoose");
    expect(markup).toContain("ui.actions.addToCart");
    expect(markup).not.toContain("ui.activity.chooseOutletContinue");
    expect(markup).not.toContain("ui.labels.chooseOutlet");
  });

  it("includes the single actual outlet for a one-outlet product", () => {
    expect(hrefs(render("source=vendor", []))).toContain("/customer/outlets/cheap");
  });

  it("renders breadcrumbs without any client fetch", () => {
    render("", [outlet("cheap", 5), outlet("dear", 9)]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
