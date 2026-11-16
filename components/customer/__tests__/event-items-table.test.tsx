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

const atStop = (item: VendorEventItem, stop: { id: string; name: string; startsOn: string; endsOn: string; stall: string; price: number }): VendorEventItem => ({
  ...item,
  key: `${stop.id}:${item.product.id}`,
  registrationId: `registration-${stop.id}`,
  location: { ...item.location, id: stop.id, name: stop.name, startsOn: stop.startsOn, endsOn: stop.endsOn },
  stallNumber: stop.stall,
  product: { ...item.product, id: `${item.product.id}-${stop.id}`, price: stop.price },
});

const vendorId = "1661f4ea-c8e3-73e5-583d-a05f7e503ec2";

describe("EventItemsTable grouped by item", () => {
  it("shows each item once with its stops, linking every stop row to that stop's stall page", async () => {
    const [tea, jar] = eventItems;
    const penang = { id: "location-2", name: "Penang Esplanade", startsOn: "2026-11-27", endsOn: "2026-11-29", stall: "C01" };
    const markup = renderToStaticMarkup(await EventItemsTable({
      vendorId,
      items: [tea, jar, atStop(tea, { ...penang, price: 55 }), atStop(jar, { ...penang, price: 12 })],
    }));

    expect(markup).not.toContain("<table");
    expect(markup.match(/data-event-item-group=""/g)).toHaveLength(2);
    expect(markup.match(/Cameron Highlands Tea Gift Set/g)).toHaveLength(2); // name + its stop list label
    expect(markup).not.toContain("Reserve");
    expect(markup).toContain(`href="/customer/events/demo-pop-up-fiesta/${vendorId}?stop=location-1"`);
    expect(markup).toContain(`href="/customer/events/demo-pop-up-fiesta/${vendorId}?stop=location-2"`);
    expect(markup).toContain('href="/customer/events/demo-pop-up-fiesta"');
    expect(markup).toContain("Stall B02");
    expect(markup).toContain("Stall C01");
    expect(markup).toContain("9:00 AM – 6:00 PM");
    expect(markup).toContain("ui.vendor.eventItems.kinds.product");

    const teaGroup = markup.slice(markup.indexOf("Cameron Highlands Tea Gift Set"), markup.indexOf("Strawberry Preserve Jar"));
    expect(teaGroup.match(/RM55\.00/g)).toHaveLength(1); // same price everywhere: shown once under the item
    const jarGroup = markup.slice(markup.indexOf("Strawberry Preserve Jar"));
    expect(jarGroup).toContain("ui.vendor.eventItems.free"); // differs per stop: each row shows its own
    expect(jarGroup).toContain("RM12.00");
  });

  it("keeps the empty state when the vendor has no upcoming event", async () => {
    const markup = renderToStaticMarkup(await EventItemsTable({ items: [], vendorId }));
    expect(markup).toContain("ui.vendor.eventItems.noUpcomingEvent");
    expect(markup).toContain("ui.vendor.eventItems.noUpcomingEventHint");
  });
});
