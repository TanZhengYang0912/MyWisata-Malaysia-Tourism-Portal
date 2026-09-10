import { describe, expect, it } from "vitest";
import type { Place, PlaceProduct } from "@/backend/core/types";
import {
  filterPlaceActivities,
  getPlaceActivityFilterCounts,
  getPlaceActivityLabel,
  getEntryPrice,
  getPlaceListingCounts,
  filterPlaceListings,
  parsePlaceAreaIds,
  serializePlaceAreaIds,
} from "@/lib/customer/place-list";

function place(id: string, entryFee: number | null): Place {
  return {
    id,
    parentId: null,
    slug: id,
    name: id,
    level: "poi",
    state: "Penang",
    district: null,
    lat: 5.4,
    lng: 100.3,
    entryFee,
    imageUrl: null,
    tagline: null,
    intro: null,
    managedByVendorId: null,
    detail: null,
    updatedAt: "2026-08-14T00:00:00Z",
  };
}

const places = [place("paid", 15), place("free", 0), place("public", null)];
const productCounts = { paid: 1, free: 0, public: 2 };
const regionByPoi = { paid: "north", free: "south", public: "north" };

describe("place listing filters", () => {
  it("counts all, bookable, and free-entry places independently", () => {
    expect(getPlaceListingCounts(places, productCounts)).toEqual({
      all: 3,
      bookable: 2,
      freeEntry: 2,
    });
  });

  it("defaults to all places and narrows by the selected filter", () => {
    expect(filterPlaceListings(places, productCounts, regionByPoi, "all", new Set())).toHaveLength(3);
    expect(filterPlaceListings(places, productCounts, regionByPoi, "bookable", new Set())).toEqual([places[0], places[2]]);
    expect(filterPlaceListings(places, productCounts, regionByPoi, "freeEntry", new Set())).toEqual([places[1], places[2]]);
  });

  it("combines the availability and area filters", () => {
    expect(filterPlaceListings(places, productCounts, regionByPoi, "bookable", new Set(["north"]))).toEqual([places[0], places[2]]);
  });

  it("keeps a future-proof multi-area selection in the URL and ignores unknown areas", () => {
    expect(parsePlaceAreaIds(["north", "unknown", "south", "north"], new Set(["north", "south"]))).toEqual(new Set(["north", "south"]));
    expect(serializePlaceAreaIds(new Set(["south", "north"]))).toEqual(["north", "south"]);
  });
});

const products = [
  { relation: "guide_service", product: { id: "guide" } },
  { relation: "addon", product: { id: "addon" } },
] as unknown as PlaceProduct[];

describe("place activity presentation helpers", () => {
  it("uses a precise customer-facing label for every place relation", () => {
    expect(getPlaceActivityLabel("admission")).toBe("Entry ticket");
    expect(getPlaceActivityLabel("guide_service")).toBe("Guided experience");
    expect(getPlaceActivityLabel("addon")).toBe("Add-on");
  });

  it("counts and filters only the non-admission categories", () => {
    expect(getPlaceActivityFilterCounts(products)).toEqual({ all: 2, guide_service: 1, addon: 1 });
    expect(filterPlaceActivities(products, "all")).toHaveLength(2);
    expect(filterPlaceActivities(products, "guide_service")).toEqual([products[0]]);
  });

  it("ignores an admission product that reaches the grid by mistake", () => {
    const withTicket = [
      ...products,
      { relation: "admission", product: { id: "ticket" } },
    ] as unknown as PlaceProduct[];

    expect(getPlaceActivityFilterCounts(withTicket).all).toBe(2);
    expect(filterPlaceActivities(withTicket, "all")).toHaveLength(2);
  });
});

function ticketAt(price: number, deltas: number[] = []): PlaceProduct {
  return {
    relation: "admission",
    product: {
      id: `t-${price}`,
      price,
      variants: deltas.map((priceDelta, i) => ({ id: `v${i}`, label: `v${i}`, priceDelta })),
    },
  } as unknown as PlaceProduct;
}

describe("getEntryPrice", () => {
  it("prefers the ticket price so a vendor's edit shows immediately", () => {
    expect(getEntryPrice(16, [ticketAt(18)])).toEqual({ price: 18, fromTicket: true });
  });

  it("uses the cheapest tier, so the badge cannot contradict the ticket list", () => {
    expect(getEntryPrice(80, [ticketAt(80, [0, -47, 18, -35])])).toEqual({ price: 33, fromTicket: true });
  });

  it("takes the cheapest when a place sells more than one ticket", () => {
    expect(getEntryPrice(60, [ticketAt(60), ticketAt(55)])).toEqual({ price: 55, fromTicket: true });
  });

  it("falls back to the posted fee when nothing is sold here", () => {
    expect(getEntryPrice(49, [])).toEqual({ price: 49, fromTicket: false });
  });

  it("keeps free and no-gate distinguishable", () => {
    expect(getEntryPrice(0, [])).toEqual({ price: 0, fromTicket: false });
    expect(getEntryPrice(null, [])).toEqual({ price: null, fromTicket: false });
  });

  it("survives a ticket with no variants", () => {
    expect(getEntryPrice(16, [ticketAt(16, [])])).toEqual({ price: 16, fromTicket: true });
  });
});
