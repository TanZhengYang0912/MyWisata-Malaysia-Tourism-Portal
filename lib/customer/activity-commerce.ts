export interface ActivityOutletReference {
  outletId: string;
}

/**
 * Counts the outlets that can represent a product purchase. Direct products
 * carry only `outletId`; shared products repeat that representative outlet in
 * `outletChoices`, so the IDs must be de-duplicated.
 */
export function getEffectiveOutletCount(
  activityOutletId: string,
  outletChoices: readonly ActivityOutletReference[],
): number {
  return new Set(
    [activityOutletId, ...outletChoices.map((choice) => choice.outletId)].filter(Boolean),
  ).size;
}

export function shouldRequireOutletSelection(source: string | null, effectiveOutletCount: number): boolean {
  return source === "vendor" && effectiveOutletCount > 1;
}
