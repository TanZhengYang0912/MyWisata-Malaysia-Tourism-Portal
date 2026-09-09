export type SponsoredTarget = {
  state: string | null;
  categorySlug: string | null;
};

export type SponsoredRequestContext = {
  state: string | null;
  categorySlug?: string | null;
  categorySlugs?: readonly string[];
};

export type SponsoredPlacementOrderable = SponsoredTarget & {
  id: string;
  priority: number;
  startsAt: string;
};

function normalizeScope(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function selectedCategories(request: SponsoredRequestContext): Set<string> {
  const values = request.categorySlugs ?? [request.categorySlug ?? null];
  return new Set(values.map(normalizeScope).filter((value): value is string => value !== null));
}

export function getSponsoredSpecificity(
  target: SponsoredTarget,
  request: SponsoredRequestContext,
): number | null {
  const targetState = normalizeScope(target.state);
  const requestState = normalizeScope(request.state);
  if (targetState !== null && targetState !== requestState) return null;

  const targetCategory = normalizeScope(target.categorySlug);
  if (targetCategory !== null && !selectedCategories(request).has(targetCategory)) return null;

  if (targetState !== null && targetCategory !== null) return 0;
  if (targetState !== null) return 1;
  if (targetCategory !== null) return 2;
  return 3;
}

export function compareEligibleSponsoredPlacements(
  left: SponsoredPlacementOrderable,
  right: SponsoredPlacementOrderable,
  request: SponsoredRequestContext,
): number {
  const leftSpecificity = getSponsoredSpecificity(left, request) ?? Number.POSITIVE_INFINITY;
  const rightSpecificity = getSponsoredSpecificity(right, request) ?? Number.POSITIVE_INFINITY;
  if (leftSpecificity !== rightSpecificity) return leftSpecificity - rightSpecificity;
  if (left.priority !== right.priority) return left.priority - right.priority;

  const startsAtOrder = Date.parse(left.startsAt) - Date.parse(right.startsAt);
  if (startsAtOrder !== 0) return startsAtOrder;
  return left.id.localeCompare(right.id);
}
