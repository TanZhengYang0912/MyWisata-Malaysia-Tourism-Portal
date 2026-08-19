export type CustomerVoucherClaimStatus = "claimed" | "redeemed" | "expired" | "revoked";
export type CustomerVoucherTab = "deals" | "mine";

export interface CustomerVoucherClaim {
  id: string;
  status: CustomerVoucherClaimStatus;
  claimedAt: string;
  redeemedAt: string | null;
  expiresAt: string | null;
}

export interface CustomerVoucher {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorLogoUrl: string | null;
  outletId: string | null;
  outletName: string | null;
  outletImageUrl: string | null;
  locationLabel: string | null;
  productId: string | null;
  productName: string | null;
  eligibleProductCount: number;
  eligibleProductNames: string[];
  code: string;
  name: string;
  voucherType: "percent" | "fixed" | "bogo";
  discountValue: number;
  minSpend: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usesCount: number;
  redemptionMode: "online" | "in_store" | "both";
  claim: CustomerVoucherClaim | null;
}

export function getClaimLabel(status?: CustomerVoucherClaimStatus | null): "Claim" | "Claimed" | "Redeemed" {
  if (status === "redeemed") return "Redeemed";
  if (status === "claimed") return "Claimed";
  return "Claim";
}

export function buildVoucherUseHref(voucherCode: string, claimId: string): string {
  return `/customer/cart?voucher=${encodeURIComponent(voucherCode)}&claim=${encodeURIComponent(claimId)}`;
}

export function isClaimUsable(input: {
  status: CustomerVoucherClaimStatus;
  expiresAt?: string | null;
  now?: Date;
}): boolean {
  if (input.status !== "claimed") return false;
  if (!input.expiresAt) return true;
  const expiresAt = new Date(input.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > (input.now ?? new Date()).getTime();
}
