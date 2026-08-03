import { describe, expect, it } from "vitest";
import { buildDiscoveryMapData } from "@/lib/demo-map/discovery-pins";
import type { Activity, Outlet } from "@/backend/core/types";

let seq = 0;
function makeOutlet(overrides: Partial<Outlet> = {}): Outlet {
  seq += 1;
  return {
    id: `outlet-${seq}`,
    vendorId: "vendor-1",
    name: `Outlet ${seq}`,
    category: "Food",
    state: "Perak",
    city: "Ipoh",
    address: "123 Demo Street",
    lat: 4.6,
    lng: 101.1,
    hours: "9am - 6pm",
    verified: true,
    open: true,
    rating: 4.5,
    reviews: 10,
    ...overrides,
  };
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  seq += 1;
  return {
    id: `product-${seq}`,
    outletId: "outlet-1",
    name: `Product ${seq}`,
    category: "Food",
    description: "Demo product",
    image: "",
    price: 20,
    rating: 4.5,
    reviews: 5,
    duration: "",
    requiresBooking: false,
    variants: [],
    ...overrides,
  };
}

describe("buildDiscoveryMapData", () => {
  it("plots a direct (single-outlet) product as an outlet pin", () => {
    const outlet = makeOutlet({ id: "o1" });
    const product = makeActivity({ id: "p1", outletId: "o1" });

    const { pins } = buildDiscoveryMapData([product], [outlet]);

    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ kind: "outlet", id: "o1" });
    expect((pins[0] as { products: Activity[] }).products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("expands a shared product to every outlet holding an active offer", () => {
    const o1 = makeOutlet({ id: "o1" });
    const o2 = makeOutlet({ id: "o2", city: "Kuching", state: "Sarawak" });
    const shared = makeActivity({
      id: "p-shared",
      outletId: "o1",
      offers: [
        { outletId: "o1", price: 100, status: "active" },
        { outletId: "o2", price: 90, status: "active" },
      ],
    });

    const { pins } = buildDiscoveryMapData([shared], [o1, o2]);

    const outletPins = pins.filter((p) => p.kind === "outlet");
    expect(outletPins).toHaveLength(2);
    for (const pin of outletPins) {
      expect((pin as { products: Activity[] }).products.map((p) => p.id)).toEqual(["p-shared"]);
    }
  });

  it("never lists the same product twice inside one outlet, even with a duplicated offer entry", () => {
    const outlet = makeOutlet({ id: "o1" });
    const product = makeActivity({
      id: "p1",
      outletId: "o1",
      offers: [
        { outletId: "o1", price: 20, status: "active" },
        { outletId: "o1", price: 20, status: "active" }, // data glitch: same outlet twice
      ],
    });

    const { pins } = buildDiscoveryMapData([product], [outlet]);

    expect(pins).toHaveLength(1);
    expect((pins[0] as { products: Activity[] }).products).toHaveLength(1);
  });

  it("plots a place-bound product at its own coordinate, not the provider outlet's", () => {
    const providerOutlet = makeOutlet({ id: "o1", city: "Kota Kinabalu", state: "Sabah", lat: 5.98, lng: 116.07 });
    const activity = makeActivity({
      id: "p-river",
      outletId: "o1",
      typeSlugs: ["adventure"],
      place: { state: "Sabah", district: "Kinabatangan", lat: 5.53, lng: 118.32 },
    });

    const { pins } = buildDiscoveryMapData([activity], [providerOutlet]);

    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ kind: "activity", id: "p-river", lat: 5.53, lng: 118.32, stateId: "sabah" });
  });

  it("omits a place-bound product with no place coordinate instead of falling back to the outlet", () => {
    const providerOutlet = makeOutlet({ id: "o1" });
    const activity = makeActivity({ id: "p-batik", outletId: "o1", typeSlugs: ["adventure"], place: undefined, name: "Batik Story Workshop" });

    const { pins, omittedPlaceProducts } = buildDiscoveryMapData([activity], [providerOutlet]);

    expect(pins).toHaveLength(0); // no activity pin AND no outlet pin — place-bound products never ride along as outlet pins
    expect(omittedPlaceProducts).toEqual([{ id: "p-batik", name: "Batik Story Workshop" }]);
  });

  it("counts distinct products per state and district, not per listing", () => {
    // Same product sold at two outlets in the same district counts once there.
    const o1 = makeOutlet({ id: "o1", city: "George Town", state: "Penang" });
    const o2 = makeOutlet({ id: "o2", city: "Air Itam", state: "Penang" }); // George Town + Air Itam both -> Timur Laut
    const shared = makeActivity({
      id: "p-shared",
      outletId: "o1",
      offers: [
        { outletId: "o1", price: 10, status: "active" },
        { outletId: "o2", price: 10, status: "active" },
      ],
    });
    const other = makeActivity({ id: "p-other", outletId: "o1" });

    const { counts } = buildDiscoveryMapData([shared, other], [o1, o2]);

    expect(counts.penang[""]).toBe(2); // p-shared + p-other, each counted once
    expect(counts.penang["timur-laut"]).toBe(2);
  });

  it("groups pins at the same coordinate into one cluster", () => {
    const sharedSpot = { lat: 3.139, lng: 101.6869 };
    const o1 = makeOutlet({ id: "o1", ...sharedSpot });
    const o2 = makeOutlet({ id: "o2", ...sharedSpot });
    const p1 = makeActivity({ id: "p1", outletId: "o1" });
    const p2 = makeActivity({ id: "p2", outletId: "o2" });

    const { clusters } = buildDiscoveryMapData([p1, p2], [o1, o2]);

    const key = "3.1390,101.6869";
    expect(clusters[key]?.sort()).toEqual(["o1", "o2"]);
  });
});
