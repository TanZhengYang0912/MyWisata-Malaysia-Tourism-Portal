export function canUseGenericFoodFulfilment(input: {
  categorySlug: string | null | undefined;
  scannedAt: string | null | undefined;
  retailScannedAt?: string | null | undefined;
  requiresBooking?: boolean | null | undefined;
  productType?: string | null | undefined;
  isEventPickup?: boolean | null | undefined;
}): boolean {
  if (input.categorySlug === "food") return Boolean(input.scannedAt);
  if (input.categorySlug === "retail" && input.productType === "product" && input.requiresBooking === false && input.isEventPickup !== true) return Boolean(input.retailScannedAt);
  return true;
}
