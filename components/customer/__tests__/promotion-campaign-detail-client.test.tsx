import type { ReactNode } from "react";
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { PromotionCampaignPublic, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${Object.values(values).join(" ")}` : ""}`,
    i18n: { resolvedLanguage: "en" },
  }),
}));

vi.mock("@/components/customer/promotion-campaign-vendor-card", () => ({
  PromotionCampaignVendorCard: ({
    layout = "grid",
    vendor,
    matchingStallNumbers = [],
  }: {
    layout?: "grid" | "featured";
    vendor: PromotionCampaignPublicVendor;
    matchingStallNumbers?: string[];
  }) => (
    <article data-testid="campaign-vendor-card" data-layout={layout} data-vendor-id={vendor.vendorId}>
      {vendor.vendorName}{matchingStallNumbers.map((stallNumber) => <span key={stallNumber}>{stallNumber}</span>)}
    </article>
  ),
}));

vi.mock("@/components/customer/customer-page-shell", () => ({
  CustomerPageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
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

async function render(element: React.ReactElement) {
  await act(async () => {
    root?.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
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
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.removeChild(container);
});

const vendor: PromotionCampaignPublicVendor = {
  vendorId: "4f774340-2bce-de7d-dc27-8208f1286b59",
  vendorName: "Heritage Walk KL",
  vendorLogoUrl: null,
  vendorKind: "shop",
  stalls: [{
    registrationId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    stallNumber: "A1",
    stallDescription: "A real outlet stall.",
    stallPosterUrl: "https://x/stall.jpg",
    products: [{ id: "a2880dc7-4c89-b498-131e-964430c836a9", name: "Jalan Alor Heritage & Food Walk", kind: "product", price: 105.6, imageUrl: null }],
  }],
};

const campaign: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "heritage-walk-kl-current-offers",
  title: "Heritage Walk KL — Local Explorer Picks",
  summary: "Duplicate summary that should not be repeated on the detail page.",
  description: "Full campaign terms including voucher eligibility and unchanged prices.",
  posterUrl: null,
  operatingHours: "10:00 AM - 6:00 PM",
  startsAt: "2026-09-25T12:00:00.000Z",
  endsAt: "2026-10-25T12:00:00.000Z",
  visibility: "live",
  locations: [{
    id: "33333333-3333-4333-8333-333333333333", name: "Petaling Street", address: "Jalan Petaling, Kuala Lumpur",
    lat: 3.1439, lng: 101.6977, startsOn: "2026-09-25", endsOn: "2026-10-25", opensAt: "10:00", closesAt: "18:00",
  }],
  vendors: [vendor],
};

const twentyVendorCampaign: PromotionCampaignPublic = {
  ...campaign,
  vendors: Array.from({ length: 20 }, (_, index) => ({
    ...vendor,
    vendorId: `vendor-${index + 1}`,
    vendorName: `Market vendor ${index + 1}`,
    stalls: [{
      ...vendor.stalls[0],
      registrationId: `registration-${index + 1}`,
      stallNumber: `A${String(index + 1).padStart(2, "0")}`,
    }],
  })).map((entry, index) => index === 0 ? {
    ...entry,
    stalls: [...entry.stalls, {
      ...vendor.stalls[0],
      registrationId: "registration-extra",
      stallNumber: "Z99",
    }],
  } : entry),
};

describe("PromotionCampaignDetailClient", () => {
  it("uses a neutral card surface for the campaign hero", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={campaign.slug} initialCampaign={campaign} initialError={null} />,
    );

    expect(markup).toContain("border border-primary/10 bg-card sm:mb-6");
    expect(markup).not.toContain("bg-gradient-to-br from-primary/[0.07] via-card to-highlight-yellow/10");
  });

  it("reduces repeated campaign copy while keeping the full description and vendor cards available", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={campaign.slug} initialCampaign={campaign} initialError={null} />,
    );

    expect(markup).toContain(campaign.title);
    expect(markup).not.toContain(campaign.summary);
    expect(markup).toContain("<details");
    expect(markup).toContain("ui.promotionCampaigns.campaignDetails");
    expect(markup).toContain(campaign.description);
    expect(markup).toContain('data-testid="campaign-vendor-card"');

    const details = markup.match(/<details([^>]*)>([\s\S]*?)<\/details>/);
    expect(details).not.toBeNull();
    expect(details?.[1]).not.toContain("open");
    expect(details?.[2]).toContain(campaign.description);
  });

  it("shows the complete event poster and places campaign details before the vendor directory", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient
        slug={campaign.slug}
        initialCampaign={{ ...campaign, posterUrl: "https://example.test/event-poster.jpg" }}
        initialError={null}
      />,
    );

    expect(markup).toContain('src="https://example.test/event-poster.jpg"');
    expect(markup).toContain("object-contain");
    expect(markup.indexOf("ui.promotionCampaigns.campaignDetails")).toBeLessThan(
      markup.indexOf("ui.promotionCampaigns.vendorsSection"),
    );
  });

  it("uses a featured vendor card when exactly one vendor participates", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={campaign.slug} initialCampaign={campaign} initialError={null} />,
    );

    expect(markup).toContain('data-layout="featured"');
  });

  it("keeps the regular vendor grid when several vendors participate", () => {
    const secondVendor = { ...vendor, vendorId: "another-vendor", vendorName: "Another vendor" };
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient
        slug={campaign.slug}
        initialCampaign={{ ...campaign, vendors: [vendor, secondVendor] }}
        initialError={null}
      />,
    );

    expect(markup).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(markup.match(/data-layout="grid"/g)).toHaveLength(2);
  });
});

describe("PromotionCampaignDetailClient vendor directory scaling", () => {
  it("offers search for multiple vendors or stalls while keeping a single entry uncluttered", () => {
    const multiVendorCampaign = {
      ...campaign,
      vendors: [vendor, { ...vendor, vendorId: "another-vendor", vendorName: "Another vendor" }],
    };
    const multiVendorMarkup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={campaign.slug} initialCampaign={multiVendorCampaign} initialError={null} />,
    );
    const singleVendorMarkup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={campaign.slug} initialCampaign={campaign} initialError={null} />,
    );

    expect(multiVendorMarkup).toContain('placeholder="ui.promotionCampaigns.searchVendorsOrStalls"');
    expect(singleVendorMarkup).not.toContain('placeholder="ui.promotionCampaigns.searchVendorsOrStalls"');
  });

  it("limits a 20-vendor directory to 12 cards per page", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={twentyVendorCampaign.slug} initialCampaign={twentyVendorCampaign} initialError={null} />,
    );

    expect(markup.match(/data-vendor-id=/g)).toHaveLength(12);
    expect(markup).toContain("Market vendor 12");
    expect(markup).not.toContain("Market vendor 13");
  });

  it("shows separate vendor and stall totals plus directory search and pagination", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={twentyVendorCampaign.slug} initialCampaign={twentyVendorCampaign} initialError={null} />,
    );

    expect(markup).toContain("ui.promotionCampaigns.vendorCount 20");
    expect(markup).toContain("ui.promotionCampaigns.stallCount 21");
    expect(markup).toContain('placeholder="ui.promotionCampaigns.searchVendorsOrStalls"');
    expect(markup).toContain('aria-label="ui.promotionCampaigns.vendorPages"');
    expect(markup).toContain("pagination.range");
  });

  it("searches vendor names and stall numbers, and identifies a matching stall", async () => {
    await render(
      <PromotionCampaignDetailClient slug={twentyVendorCampaign.slug} initialCampaign={twentyVendorCampaign} initialError={null} />,
    );

    const search = findOne(container, (element) => element.tagName === "INPUT" && element.type === "search");
    await setInputValue(search, " z99 ");

    expect(container.textContent).toContain("Market vendor 1");
    expect(container.textContent).toContain("Z99");
    expect(findElements(container, (element) => element.tagName === "ARTICLE")).toHaveLength(1);
  });

  it("paginates 20 vendors and returns to page one when a new query is entered", async () => {
    await render(
      <PromotionCampaignDetailClient slug={twentyVendorCampaign.slug} initialCampaign={twentyVendorCampaign} initialError={null} />,
    );

    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "accessibility.nextPage"));
    expect(findElements(container, (element) => element.tagName === "ARTICLE")).toHaveLength(8);
    expect(container.textContent).toContain("Market vendor 13");

    const search = findOne(container, (element) => element.tagName === "INPUT" && element.type === "search");
    await setInputValue(search, "market");
    expect(findElements(container, (element) => element.tagName === "ARTICLE")).toHaveLength(12);
    expect(container.textContent).toContain("Market vendor 1");
    expect(container.textContent).not.toContain("Market vendor 13");

    await setInputValue(search, "no matching vendor");
    expect(container.textContent).toContain("ui.promotionCampaigns.noVendorSearchResults");
    expect(findElements(container, (element) => element.tagName === "ARTICLE")).toHaveLength(0);
  });

  it("provides directory copy in English, Malay, and Simplified Chinese", () => {
    for (const locale of ["en", "ms", "zh-CN"]) {
      const messages = JSON.parse(readFileSync(
        resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`),
        "utf8",
      )) as { ui: { promotionCampaigns: Record<string, string> } };

      expect(messages.ui.promotionCampaigns.searchVendorsOrStalls).toBeTruthy();
      expect(messages.ui.promotionCampaigns.noVendorSearchResults).toBeTruthy();
      expect(messages.ui.promotionCampaigns.vendorPages).toBeTruthy();
      expect(messages.ui.promotionCampaigns.stallCount_other).toBeTruthy();
    }
  });
});
