import { describe, expect, it } from "vitest";
import type { Place, PlaceProduct } from "@/backend/core/types";
import {
  filterPlaceActivities,
  getPlaceActivityFilterCounts,
  getPlaceActivityLabel,
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
  { relation: "admission", product: { id: "ticket" } },
  { relation: "guide_service", product: { id: "guide" } },
  { relation: "addon", product: { id: "addon" } },
] as unknown as PlaceProduct[];

describe("place activity presentation helpers", () => {
  it("uses a precise customer-facing label for every place relation", () => {
    expect(getPlaceActivityLabel("admission")).toBe("Entry ticket");
    expect(getPlaceActivityLabel("guide_service")).toBe("Guided experience");
    expect(getPlaceActivityLabel("addon")).toBe("Add-on");
  });

  it("counts and filters all activity categories", () => {
    expect(getPlaceActivityFilterCounts(products)).toEqual({ all: 3, admission: 1, guide_service: 1, addon: 1 });
    expect(filterPlaceActivities(products, "all")).toHaveLength(3);
    expect(filterPlaceActivities(products, "guide_service")).toEqual([products[1]]);
  });
});
