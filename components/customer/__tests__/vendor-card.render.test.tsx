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
    t: (key: string, options?: Record<string, unknown>) => key === "ui.search.outletCount" ? `${options?.count} outlets` : text[key] ?? key,
  }),
}));
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
  it("puts location, distance, description, outlet count and categories in the drawer", () => {
    const markup = renderToStaticMarkup(<VendorCard vendor={vendor} description={vendor.description} distanceLabel="2.1 km away" categories={["food"]} />);
    const drawer = drawerOf(markup);

    expect(markup).toContain("mw-card-expand-card");
    expect(drawer).toContain("George Town, Penang");
    expect(drawer).toContain("2.1 km away");
    expect(drawer).toContain("charcoal-roasted coffee");
    expect(drawer).toContain("2 outlets");
    expect(markup).toMatch(/<a [^>]*href="\/customer\/vendor\/v1"[^>]*data-card-primary-cta="true"[^>]*>Explore vendor<\/a>/);
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
});
