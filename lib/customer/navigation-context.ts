const CUSTOMER_ROOT = "/customer";

export function getCustomerReturnPath(value: string | null | undefined, fallback = CUSTOMER_ROOT) {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith(CUSTOMER_ROOT) || candidate.startsWith("//")) return fallback;
  return candidate;
}

export function buildActivityPath(activityId: string, returnTo?: string, outletId?: string, source?: string) {
  const path = `/customer/activity/${encodeURIComponent(activityId)}`;
  const safeReturnTo = returnTo ? getCustomerReturnPath(returnTo) : null;
  const params = new URLSearchParams();
  const effectiveSource = source || (safeReturnTo && safeReturnTo.includes("/customer/vendor") ? "vendor" : undefined);
  if (effectiveSource) params.set("source", effectiveSource);
  if (outletId) params.set("outletId", outletId);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
