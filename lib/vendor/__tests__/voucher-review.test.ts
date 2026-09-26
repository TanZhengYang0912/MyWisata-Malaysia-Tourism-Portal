import { describe, expect, it } from "vitest";
import { canVendorOwnerReviewVoucher, getSuperAdminReviewUpdate, getVendorReviewUpdate } from "@/lib/vendor/voucher-review";

describe("vendor voucher approval", () => {
  it("allows the HQ owner to approve a manager-created pending voucher", () => {
    expect(canVendorOwnerReviewVoucher({ actorId: "owner-1", vendorOwnerId: "owner-1", createdBy: "manager-1", reviewStatus: "pending_review", vendorReviewStatus: "pending" })).toBe(true);
    expect(canVendorOwnerReviewVoucher({ actorId: "owner-1", vendorOwnerId: "owner-1", createdBy: "owner-1", reviewStatus: "pending_review", vendorReviewStatus: "pending" })).toBe(false);
    expect(canVendorOwnerReviewVoucher({ actorId: "owner-1", vendorOwnerId: "owner-1", reviewStatus: "approved", vendorReviewStatus: "pending" })).toBe(false);
    expect(canVendorOwnerReviewVoucher({ actorId: "owner-1", vendorOwnerId: "owner-1", createdBy: "manager-1", reviewStatus: "pending_review", vendorReviewStatus: "approved" })).toBe(false);
  });

  it("keeps a Vendor-approved voucher pending for Super Admin", () => {
    expect(getVendorReviewUpdate({ action: "approve", reviewerId: "owner-1", note: "Looks good" })).toEqual({
      vendor_review_status: "approved",
      vendor_review_note: "Looks good",
      vendor_reviewed_by: "owner-1",
      is_active: false,
    });
  });

  it("keeps a Vendor-rejected voucher inactive", () => {
    expect(getVendorReviewUpdate({ action: "reject", reviewerId: "owner-1", note: "Missing terms" })).toEqual({
      vendor_review_status: "rejected",
      vendor_review_note: "Missing terms",
      vendor_reviewed_by: "owner-1",
      is_active: false,
    });
  });

  it("activates only after Super Admin approval", () => {
    expect(getSuperAdminReviewUpdate({ action: "approve", reviewerId: "admin-1", note: "Approved" })).toEqual({
      review_status: "approved",
      review_note: "Approved",
      reviewed_by: "admin-1",
      is_active: true,
    });
  });

  it("stores the accepted rejected status after Super Admin rejection", () => {
    expect(getSuperAdminReviewUpdate({ action: "reject", reviewerId: "admin-1", note: "Missing terms" })).toEqual({
      review_status: "rejected",
      review_note: "Missing terms",
      reviewed_by: "admin-1",
      is_active: false,
    });
  });
});
