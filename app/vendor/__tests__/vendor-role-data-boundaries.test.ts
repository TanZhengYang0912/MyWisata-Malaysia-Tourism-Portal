import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Vendor role data boundaries", () => {
  it("loads bookings metadata through scoped APIs and shares it with SlotForm", () => {
    const bookings = source("app/vendor/bookings/page.tsx");
    const slotForm = source("components/vendor/slot-form.tsx");

    expect(bookings).toContain("loadScopedProducts");
    expect(bookings).toContain("/products?view=booking_metadata&sort=name");
    expect(bookings).toContain("/outlets?view=booking_metadata&sort=name");
    expect(bookings).toContain("view=booking_metadata");
    expect(bookings).toContain("page=${page}&pageSize=24");
    expect(bookings).not.toContain("supabase.from('products')");
    expect(bookings).toContain("<SlotForm vendorId={vendorId} outlets={outlets} products={products}");
    expect(slotForm).toContain("outlets: { id: string; name: string }[]");
    expect(slotForm).toContain("products: { id: string; name: string; outlet_id: string");
    expect(slotForm).not.toContain("createClient");
    expect(slotForm).not.toContain("supabase.from('outlets')");
    expect(slotForm).not.toContain("supabase.from('products')");
  });

  it("keeps Vendor profile and Voucher analytics owner-only", () => {
    const profile = source("app/api/vendors/[vendorId]/route.ts");
    const voucherAnalytics = source("app/api/vendors/[vendorId]/vouchers/analytics/route.ts");

    expect(profile).toMatch(/export async function GET[\s\S]+authorizeVendor\(vendorId, \['vendor_owner'\]\)/);
    expect(voucherAnalytics).toContain("authorizeVendor(vendorId, ['vendor_owner'])");
  });

  it("removes other Outlet offers from scoped Product responses", () => {
    const products = source("app/api/vendors/[vendorId]/products/route.ts");
    const outlets = source("app/api/vendors/[vendorId]/outlets/route.ts");

    expect(products).toContain("scopedOffers");
    expect(products).toContain("allowedOutletIds.has(offer.outlet_id)");
    expect(products).toMatch(/\.\.\.product,[\s\S]+outlet_offers: scopedOffers/);
    expect(products).toContain("metadataOnly");
    expect(products).toContain("booking_metadata");
    expect(outlets).toContain("metadataOnly");
    expect(outlets).toContain("booking_metadata");
    expect(outlets).toContain("access.access.isOutletManager ||");
    expect(outlets).toContain("id,name,city,state,status,operating_hours");
  });

  it("rejects Outlet Managers before querying Vendor-wide share analytics", () => {
    const analytics = source("app/api/vendor/share-analytics/route.ts");
    const rejection = analytics.indexOf("context.role !== 'vendor_owner'");
    const serviceQuery = analytics.indexOf("const stats = await getVendorShareStats");

    expect(rejection).toBeGreaterThan(-1);
    expect(serviceQuery).toBeGreaterThan(rejection);
    expect(analytics).toContain("Vendor owner permission required");
  });
});
