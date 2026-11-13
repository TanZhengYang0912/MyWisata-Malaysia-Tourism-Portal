import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count === undefined ? key : `${key}:${options.count}`, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("@/components/customer/localized-content", () => ({ LocalizedContent: ({ sourceText, children }: { sourceText: string; children: (value: { text: string; control: null }) => React.ReactNode }) => children({ text: sourceText, control: null }) }));

import { EventCard } from "@/components/customer/event-card";
import { formatEventDateRange, formatEventHours } from "@/lib/promotion-campaigns/locations";

const stall = (locationId: string) => ({ registrationId: locationId, locationId, stallNumber: "1", stallDescription: "", stallPosterUrl: "", products: [] });
const campaign: PromotionCampaignPublic = {
  id: "c1", slug: "night-market", title: "Bangsar Night Market", summary: "", description: "", posterUrl: null, operatingHours: null,
  startsAt: "2026-11-12T00:00:00+08:00", endsAt: "2026-11-14T23:59:59+08:00", visibility: "live",
  locations: [{ id: "l1", name: "Bangsar Village", address: null, lat: null, lng: null, startsOn: "2026-11-12", endsOn: "2026-11-14", opensAt: "10:00", closesAt: "18:00" }],
  vendors: [{ vendorId: "v1", vendorName: "V1", vendorLogoUrl: null, vendorKind: "shop", stalls: [stall("l1"), stall("other")] }, { vendorId: "v2", vendorName: "V2", vendorLogoUrl: null, vendorKind: "event", stalls: [stall("l1")] }],
};
const now = new Date("2026-11-13T14:30:00+08:00");

describe("EventCard", () => {
  it("links the title to the event and shows dates, hours, place, stalls with the tent and Open now", () => {
    const markup = renderToStaticMarkup(<EventCard campaign={campaign} day="2026-11-13" now={now} />);
    expect(markup).toContain('href="/customer/events/night-market"');
    expect(markup).toContain("Bangsar Night Market");
    expect(markup).toContain(formatEventDateRange("2026-11-12", "2026-11-14", "en"));
    expect(markup).toContain(formatEventHours("10:00", "18:00", "en"));
    expect(markup).toContain("Bangsar Village");
    expect(markup).toContain("lucide-map-pin");
    expect(markup).toContain("ui.promotionCampaigns.stallCount:2");
    expect(markup).toContain("lucide-tent");
    expect(markup).toContain("ui.operatingHours.openNow");
    expect(markup.toLowerCase()).not.toContain("entry");
  });

  it("puts the dates and the hours on separate lines so the closing time is never cut off", () => {
    const markup = renderToStaticMarkup(<EventCard campaign={campaign} day="2026-11-13" now={now} />);
    expect(markup).toContain(`<span class="block truncate max-sm:whitespace-normal">${formatEventDateRange("2026-11-12", "2026-11-14", "en")}</span>`);
    expect(markup).toContain(`<span class="block truncate">${formatEventHours("10:00", "18:00", "en")}</span>`);
    expect(markup).not.toContain(" · ");
  });

  it("falls back to a calendar picture without a poster", () => {
    expect(renderToStaticMarkup(<EventCard campaign={campaign} day="2026-11-13" now={now} />)).toContain("lucide-calendar-days");
  });

  it("renders nothing on a day the event does not run", () => {
    expect(renderToStaticMarkup(<EventCard campaign={campaign} day="2026-11-20" now={now} />)).toBe("");
  });

  it("shows no open state on another day or before the page knows the time", () => {
    for (const markup of [
      renderToStaticMarkup(<EventCard campaign={campaign} day="2026-11-14" now={now} />),
      renderToStaticMarkup(<EventCard campaign={campaign} day="2026-11-13" now={null} />),
    ]) {
      expect(markup).not.toContain("ui.operatingHours.openNow");
      expect(markup).not.toContain("ui.operatingHours.closedNow");
    }
  });
});
