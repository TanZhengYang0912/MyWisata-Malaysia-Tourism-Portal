const CUSTOMER_ROOT = "/customer";

export function getCustomerReturnPath(value: string | null | undefined, fallback = CUSTOMER_ROOT) {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith(CUSTOMER_ROOT) || candidate.startsWith("//")) return fallback;
  return candidate;
}

export function buildActivityPath(activityId: string, returnTo?: string) {
  const path = `/customer/activity/${encodeURIComponent(activityId)}`;
  const safeReturnTo = returnTo ? getCustomerReturnPath(returnTo) : null;
  return safeReturnTo ? `${path}?returnTo=${encodeURIComponent(safeReturnTo)}` : path;
}
