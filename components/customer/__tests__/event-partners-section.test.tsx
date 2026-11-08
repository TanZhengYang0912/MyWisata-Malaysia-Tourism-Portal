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

const drawerOf = (markup: string) => markup.slice(markup.indexOf('data-card-details-inline="true"'));

describe("Event Featured Partners", () => {
  it("uses the shared expanding card with location, schedule and description in the drawer", () => {
    const markup = renderToStaticMarkup(<EventPartnersSection partners={[partner]} featured />);
    const drawer = drawerOf(markup);

    expect(markup).toContain("mw-card-expand-card");
    expect(markup).toContain("ui.home.eventFeaturedPartnerBadge</span>");
    expect(markup).toContain("gap-0.5 px-1 py-0.5 text-[8px] tracking-[0.04em]");
    expect(markup).toContain("sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]");
    expect(markup).toContain("h-2 w-2 sm:h-[11px] sm:w-[11px]");
    expect(markup).toContain('id="event-featured-partners-heading" class="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl');
    expect(markup).toContain('<div id="event-partner-details-partner-1" data-card-details-inline="true"');
    expect(drawer).toContain("George Town");
    expect(drawer).toContain("Heritage Market");
    expect(drawer).toContain("A local craft vendor.");
    expect(markup).toMatch(/<a [^>]*href="\/customer\/vendors\/partner-1"[^>]*data-card-primary-cta="true"[^>]*>ui\.eventPartners\.view<\/a>/);
    expect(markup).not.toContain('aria-haspopup="dialog"');
    expect(markup).not.toContain("aria-expanded");
    expect(markup).not.toContain("line-clamp");
  });
});

describe("Event partners directory", () => {
  it("uses the same expanding card with the event partner badge and a no-upcoming fallback", () => {
    const markup = renderToStaticMarkup(<EventPartnersSection partners={[{ ...partner, next: null }]} />);
    const drawer = drawerOf(markup);

    expect(markup).toContain('id="event-partners-heading"');
    expect(markup).toContain("mw-card-expand-card");
    expect(markup).toContain("ui.eventPartners.badge");
    expect(markup).not.toContain("text-[8px]");
    expect(markup).toContain("gap-1.5 px-2.5 py-1 text-[10px] tracking-[0.12em]");
    expect(drawer).toContain("ui.eventPartners.noUpcoming");
    expect(drawer).toContain("A local craft vendor.");
  });
});
