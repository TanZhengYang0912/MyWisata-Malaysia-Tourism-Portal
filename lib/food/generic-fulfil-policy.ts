export function canUseGenericFoodFulfilment(input: {
  categorySlug: string | null | undefined;
  scannedAt: string | null | undefined;
}): boolean {
  return input.categorySlug !== "food" || Boolean(input.scannedAt);
}
