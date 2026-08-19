import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/activity/[id]/activity-detail-client.tsx"), "utf8");

describe("activity add-to-cart error handling", () => {
  it("awaits the cart write and handles persistence failures in the UI", () => {
    expect(source).toContain("await addItem");
    expect(source).toContain("catch (error)");
    expect(source).toContain("Unable to add this item to your cart");
  });
});

describe("place-bound activity presentation", () => {
  it("uses place-first copy while retaining vendor copy for ordinary activities", () => {
    expect(source).toContain("Place-based experience");
    expect(source).toContain("Provided by");
    expect(source).toContain("isPlaceBound");
    expect(source).toContain("getActivityCommerceMode");
    expect(source).toContain("No vendor booking is listed");
    expect(source).toContain("Free to explore");
  });
});

describe("vendor-to-outlet commerce boundary", () => {
  it("only requires outlet selection for multi-outlet vendor discovery", () => {
    expect(source).toContain('const vendorDiscovery = searchParams.get("source") === "vendor";');
    expect(source).toContain("getEffectiveOutletCount");
    expect(source).toContain("shouldRequireOutletSelection");
    expect(source).toContain("Choose an outlet to continue");
    expect(source).toContain("View outlet");
    expect(source).toContain("Price and availability vary by outlet");
  });

  it("preserves an outlet selected by an outlet-originated detail link", () => {
    expect(source).toContain('const requestedOutletId = searchParams.get("outletId");');
    expect(source).toContain("outletChoices.some((choice) => choice.outletId === requestedOutletId)");
  });
});
