import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("vendor food fulfilment entrypoints", () => {
  it("requires the scanner timestamp on the single-item generic endpoint", () => {
    const source = read("app/api/vendors/[vendorId]/orders/[orderItemId]/fulfil/route.ts");
    expect(source).toContain("products(product_type,requires_booking,categories(slug))");
    expect(source).toContain("canUseGenericFoodFulfilment");
    expect(source).toContain("FOOD_QR_REQUIRED");
    expect(source).toContain(".in('fulfil_status', allowedCurrentStatuses)");
  });

  it("filters food items without scans out of generic batch fulfilment", () => {
    const source = read("app/api/vendors/[vendorId]/batch/route.ts");
    expect(source).toContain("food_qr_scanned_at,retail_qr_scanned_at,event_location_id,event_listing_id,slot_starts_at,products(requires_booking,product_type,categories(slug)),orders!inner(status)");
    expect(source).toContain("canUseGenericFoodFulfilment");
    expect(source).toContain("allowedByFulfilmentPath");
  });
});
