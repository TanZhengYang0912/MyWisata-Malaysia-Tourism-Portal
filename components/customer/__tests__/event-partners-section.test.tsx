import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EventPartner } from "@/components/customer/event-partners-section";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => key === "ui.eventPartners.next"
      ? `${values?.event} · ${values?.location} · ${values?.dates}`
      : key,
    i18n: { resolvedLanguage: "en" },
  }),
}));

import { EventPartnersSection } from "@/components/customer/event-partners-section";

const partner: EventPartner = {
  id: "partner-1",
  name: "Penang Crafts",
  logoUrl: null,
  coverUrl: null,
  description: "A local craft vendor.",
  next: {
    campaignTitle: "Heritage Market",
    locationName: "George Town",
    startsOn: "2026-10-10",
    endsOn: "2026-10-11",
  },
};

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...props}>{children}</a> }));

vi.mock("@/components/shared/share-button", () => ({ ShareButton: () => <button type="button">Share</button> }));

describe("Event Featured Partners", () => {
  it("uses the shared VendorCard with the featured badge and the next event in place of the locations row", () => {
    const markup = renderToStaticMarkup(<EventPartnersSection partners={[partner]} featured />);

    expect(markup).toContain('data-vendor-card="partner-1"');
    expect(markup).toContain("ui.home.eventFeaturedPartnerBadge");
    expect(markup).toContain('id="event-featured-partners-heading" class="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl');
    expect(markup).toContain("Heritage Market · George Town");
    expect(markup).toMatch(/<a [^>]*href="\/customer\/vendors\/partner-1"[^>]*data-card-link=""/);
    expect(markup).not.toContain("ui.vendor.locationCount");
    expect(markup).not.toContain("A local craft vendor.");
    expect(markup).not.toContain('aria-haspopup="dialog"');
  });
});

describe("Event partners directory", () => {
  it("uses the same card with the event partner badge and a no-upcoming fallback", () => {
    const markup = renderToStaticMarkup(<EventPartnersSection partners={[{ ...partner, next: null }]} />);

    expect(markup).toContain('id="event-partners-heading"');
    expect(markup).toContain('data-vendor-card="partner-1"');
    expect(markup).toContain("ui.eventPartners.badge");
    expect(markup).toContain("ui.eventPartners.noUpcoming");
  });
});
