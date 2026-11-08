import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VendorEventItem } from "@/lib/promotion-campaigns/vendor-events";

vi.mock("@/lib/i18n/server", () => ({
  getServerTranslation: async () => ({
    t: (key: string, options?: Record<string, unknown>) => key === "ui.vendor.eventItems.stall"
      ? `Stall ${String(options?.stall ?? "")}`
      : key,
    locale: "en",
  }),
}));

vi.mock("@/components/shared/reference-price", async () => {
  const ReactModule = await import("react");
  return {
    ReferencePrice: ({ amountMYR }: { amountMYR: number }) => ReactModule.createElement("span", null, `RM${amountMYR.toFixed(2)}`),
  };
});

vi.mock("@/components/customer/event-reserve-dialog", async () => {
  const ReactModule = await import("react");
  return {
    EventReserveButton: ({ itemName }: { itemName: string }) => ReactModule.createElement("button", { type: "button" }, `Reserve ${itemName}`),
  };
});

import { EventItemsTable } from "@/components/customer/event-items-table";

const eventItems: VendorEventItem[] = [{
  key: "registration-1:product-1",
  registrationId: "registration-1",
  campaignSlug: "demo-pop-up-fiesta",
  campaignTitle: "Demo Pop-up Fiesta",
  location: {
    id: "location-1",
    name: "Demo Central Market Annexe",
    address: null,
    lat: null,
    lng: null,
    startsOn: "2026-11-20",
    endsOn: "2026-11-21",
    opensAt: "09:00",
    closesAt: "18:00",
  },
  stallNumber: "B02",
  product: {
    id: "product-1",
    name: "Cameron Highlands Tea Gift Set",
    kind: "product",
    price: 55,
    imageUrl: null,
  },
}, {
  key: "registration-1:product-2",
  registrationId: "registration-1",
  campaignSlug: "demo-pop-up-fiesta",
  campaignTitle: "Demo Pop-up Fiesta",
  location: {
    id: "location-1",
    name: "Demo Central Market Annexe",
    address: null,
    lat: null,
    lng: null,
    startsOn: "2026-11-20",
    endsOn: "2026-11-21",
    opensAt: "09:00",
    closesAt: "18:00",
  },
  stallNumber: "B02",
  product: {
    id: "product-2",
    name: "Strawberry Preserve Jar",
    kind: "product",
    price: 0,
    imageUrl: null,
  },
}];

describe("EventItemsTable responsive presentation", () => {
  it("keeps one semantic table and one reservation action per event across breakpoints", async () => {
    const markup = renderToStaticMarkup(await EventItemsTable({ items: eventItems }));

    expect(markup).toContain("overflow-x-auto rounded-2xl border border-border bg-card");
    expect(markup).toContain("block w-full min-w-0 text-left text-sm lg:table lg:min-w-[760px]");
    expect(markup).toContain("lg:not-sr-only lg:table-header-group");
    expect(markup).toContain("bg-secondary/50 text-xs font-bold uppercase tracking-wide text-muted-foreground");
    expect(markup).toContain("block space-y-3 p-3 lg:table-row-group lg:space-y-0");
    expect(markup).toContain("grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl border border-border bg-card p-4 lg:table-row");
    expect(markup).toContain("<table");
    expect(markup).not.toContain("<ul");
    expect(markup).toContain("Cameron Highlands Tea Gift Set");
    expect(markup).toContain("ui.vendor.eventItems.kinds.product");
    expect(markup).toContain("Demo Central Market Annexe");
    expect(markup).toContain("Demo Pop-up Fiesta");
    expect(markup).toContain("Stall B02");
    expect(markup).toContain("text-xs font-bold uppercase tracking-wide text-muted-foreground lg:hidden");
    expect(markup).toContain("2026");
    expect(markup).toContain("9:00 AM – 6:00 PM");
    expect(markup).toContain("RM55.00");
    expect(markup).toContain("ui.vendor.eventItems.free");
    expect(markup).toContain('href="/customer/events/demo-pop-up-fiesta"');
    expect(markup.match(/Reserve Cameron Highlands Tea Gift Set/g)).toHaveLength(1);
    expect(markup.match(/Reserve Strawberry Preserve Jar/g)).toHaveLength(1);
  });
});
