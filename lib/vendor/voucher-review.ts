export type VoucherReviewAction = "approve" | "reject";
export type SuperAdminVoucherReviewAction = VoucherReviewAction | "change_requested";

export type VendorVoucherReviewStatus = "pending" | "approved" | "rejected";

export function canVendorOwnerReviewVoucher(input: {
  actorId: string;
  vendorOwnerId: string;
  reviewStatus: string | null | undefined;
  vendorReviewStatus: string | null | undefined;
  createdBy?: string | null;
}): boolean {
  return input.actorId === input.vendorOwnerId
    && input.reviewStatus === "pending_review"
    && input.vendorReviewStatus === "pending"
    && (!input.createdBy || input.createdBy !== input.actorId);
}

export function getVendorReviewUpdate(input: {
  action: VoucherReviewAction;
  reviewerId: string;
  note?: string | null;
}) {
  return {
    vendor_review_status: input.action === "approve" ? "approved" : "rejected",
    vendor_review_note: input.note?.trim() || null,
    vendor_reviewed_by: input.reviewerId,
    is_active: false,
  } as const;
}

export function getSuperAdminReviewUpdate(input: {
  action: SuperAdminVoucherReviewAction;
  reviewerId: string;
  note?: string | null;
}) {
  return {
    review_status: input.action === "approve" ? "approved" : input.action,
    review_note: input.note?.trim() || null,
    reviewed_by: input.reviewerId,
    is_active: input.action === "approve",
  } as const;
}
