export type VoucherProductOutletOffer = {
  outletId: string;
  status?: string | null;
};

export type VoucherProductScope = {
  productOutletId: string | null;
  offers: VoucherProductOutletOffer[];
  selectedOutletId: string;
};

/**
 * A product target is valid only where the vendor actually sells it: either
 * directly from the outlet or through an active shared-product offer.
 */
export function isProductEligibleForVoucherOutlet(scope: VoucherProductScope): boolean {
  if (scope.productOutletId === scope.selectedOutletId) return true;
  return scope.offers.some((offer) => offer.outletId === scope.selectedOutletId && offer.status === "active");
}
