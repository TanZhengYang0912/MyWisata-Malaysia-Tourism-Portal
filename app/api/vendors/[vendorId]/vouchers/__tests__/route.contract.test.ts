import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("vendor voucher catalogue linkage", () => {
  it("validates voucher product targets against the selected outlet scope", () => {
    const source = read("app/api/vendors/[vendorId]/vouchers/route.ts");
    expect(source).toContain("isProductEligibleForVoucherOutlet");
    expect(source).toContain("INVALID_PRODUCT_SCOPE");
    expect(source).toContain("outlet_offers");
  });

  it("applies the same linkage validation to bulk voucher imports", () => {
    const source = read("app/api/vendors/[vendorId]/vouchers/bulk/route.ts");
    expect(source).toContain("isProductEligibleForVoucherOutlet");
    expect(source).toContain("INVALID_PRODUCT_SCOPE");
    expect(source).toContain("redemption_mode");
  });

  it("keeps manager-created vouchers pending until the HQ owner reviews them", () => {
    const createSource = read("app/api/vendors/[vendorId]/vouchers/route.ts");
    const reviewSource = read("app/api/vendors/[vendorId]/vouchers/[voucherId]/review/route.ts");
    expect(createSource).toContain("created_by: access.access.userId");
    expect(createSource).toContain("vendor_review_status");
    expect(createSource).toContain("vendor_review_status: access.access.isOutletManager ? 'pending' : 'approved'");
    expect(createSource).toContain("pending_review");
    expect(reviewSource).toContain("authorizeVendor(vendorId, ['vendor_owner'])");
    expect(reviewSource).toContain("getVendorReviewUpdate");
    expect(reviewSource).toContain("content_reviews");
  });

  it("resets the intermediate review stage when voucher content changes", () => {
    const updateSource = read("app/api/vendors/[vendorId]/vouchers/[voucherId]/route.ts");
    expect(updateSource).toContain("vendor_review_status");
    expect(updateSource).toContain("updateData.vendor_review_status = access.access.isOutletManager ? 'pending' : 'approved'");
  });

  it("binds single-create vouchers to the manager's only assigned outlet", () => {
    const source = read("app/api/vendors/[vendorId]/vouchers/route.ts");
    expect(source).toContain("managerOutletId");
    expect(source).toContain("body.outletId !== managerOutletId");
    expect(source).toContain("outlet_id: targetOutletId");
  });

  it("fills and validates the manager outlet scope for bulk voucher imports", () => {
    const source = read("app/api/vendors/[vendorId]/vouchers/bulk/route.ts");
    expect(source).toContain("managerOutletId");
    expect(source).toContain("item.record.outlet_id = managerOutletId");
    expect(source).toContain("outlet is outside your assigned scope");
  });

  it("allows manager-owned CSV drafts while keeping their outlet scope and creator boundary", () => {
    const source = read("app/api/vendors/[vendorId]/vouchers/drafts/route.ts");
    expect(source).toContain("authorizeVendor(vendorId)");
    expect(source).toContain("managerOutletId");
    expect(source).toContain("created_by");
    expect(source).toContain("access.access.isOutletManager");
    expect(source).toContain("outlet is outside your assigned scope");
  });
});
