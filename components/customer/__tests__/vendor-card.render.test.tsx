import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const text: Record<string, string> = {
  "ui.actions.exploreVendor": "Explore vendor",
  "ui.actions.viewDetails": "View Details",
  "ui.search.featuredPartner": "Featured partner",
  "ui.search.verifiedLocalPartner": "Verified local partner",
  "ui.search.localPartner": "Local partner",
  "ui.labels.malaysia": "Malaysia",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => key === "ui.vendor.locationCount" ? `${options?.count} locations` : text[key] ?? key,
  }),
}));
vi.mock("@/components/shared/share-button", () => ({ ShareButton: () => <button type="button" data-share>Share</button> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

import { VendorCard } from "@/components/customer/vendor-card";

const vendor = {
  id: "v1",
  name: "Kopi Kedai Lama",
  description: "Family-run kopitiam serving charcoal-roasted coffee since 1952, with a long story worth reading in full.",
  coverUrl: null,
  logoUrl: null,
  outlets: [
    { id: "o1", name: "Main", city: "George Town", state: "Penang" },
    { id: "o2", name: "Second", city: "Ipoh", state: "Perak" },
  ],
};

const drawerOf = (markup: string) => markup.slice(markup.indexOf('data-card-details-inline="true"'));

describe("VendorCard on the shared ExpandCard", () => {
  it("puts location, distance and description in the drawer, and leaves a nearby card's location count out", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={vendor} description={vendor.description} distanceLabel="2.1 km away" categories={["food"]} />);
    const drawer = drawerOf(markup);

    expect(markup).toContain("mw-card-expand-card");
    expect(drawer).toContain("George Town, Penang");
    expect(drawer).toContain("2.1 km away");
    expect(drawer).toContain("charcoal-roasted coffee");
    expect(markup).not.toContain("2 locations");
    expect(markup).toMatch(/<a [^>]*href="\/customer\/vendors\/v1"[^>]*data-card-primary-cta="true"[^>]*>Explore vendor<\/a>/);
  });

  it("has no info button and no caption strip", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={vendor} />);

    expect(markup).not.toContain("aria-expanded");
    expect(markup).not.toContain("View Details");
    expect(markup).not.toContain('aria-haspopup="dialog"');
  });

  it("renders the initials tile when the vendor has no cover", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={vendor} isFeatured />);

    const media = markup.slice(markup.indexOf("mw-card-media"), markup.indexOf("mw-card-body"));
    expect(media).toContain(">KK<");
    expect(media).toContain("Featured partner");
  });

  it("shows the full description without clamping", () => {
    const drawer = drawerOf(renderToStaticMarkup(<VendorCard vendor={vendor} description={vendor.description} />));

    expect(drawer).toContain("worth reading in full.");
    expect(drawer).not.toContain("line-clamp");
    expect(drawer).not.toContain("truncate");
  });

  it("shows the rating, status, location count and popular products when they are known", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={{
      ...vendor,
      rating: { value: 4.56, count: 12 },
      openNow: true,
      popularProducts: [1, 2, 3, 4].map((index) => ({ id: `p${index}`, name: `Product ${index}`, imageUrl: index === 2 ? null : `https://img.test/${index}.jpg`, href: `/customer/products/p${index}` })),
    }} categories={["food"]} />);
    const body = markup.slice(markup.indexOf("mw-card-body"), markup.indexOf('data-card-details-inline="true"'));
    const drawer = drawerOf(markup);

    expect(body).toContain(">4.6<");
    expect(body).toContain("(12)");
    expect(body).toContain("ui.operatingHours.openNow");
    expect(body).toContain("2 locations");
    expect(drawer).toContain("ui.vendor.popular");
    expect(drawer.match(/href="\/customer\/products\/p\d"/g)).toHaveLength(3);
    expect(drawer).toContain("bg-secondary");
  });

  it("leaves out the rating, status and popular lines when the data is missing", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={vendor} distanceLabel="1 km away" />);

    expect(markup).not.toContain("fill=\"var(--highlight-yellow)\"");
    expect(markup).not.toContain("ui.operatingHours");
    expect(markup).not.toContain("ui.vendor.popular");
    expect(markup).not.toContain('<p class="text-xs text-muted-foreground"></p>');
  });

  it("tags only featured vendors as featured, shares the vendor and offers no save button", () => {
    expect(renderToStaticMarkup(<VendorCard vendor={vendor} isFeatured />)).toContain("Featured partner");
    const plain = renderToStaticMarkup(<VendorCard vendor={vendor} />);
    expect(plain).toContain("Verified local partner");
    expect(plain).toContain("data-share");
    expect(plain).not.toContain("aria-pressed");
  });
});
