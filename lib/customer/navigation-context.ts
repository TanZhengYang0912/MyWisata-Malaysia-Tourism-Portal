const CUSTOMER_ROOT = "/customer";

export function appendCustomerQuery(path: string, values: Record<string, string | string[] | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.append(key, value);
  }
  return params.size ? `${path}?${params}` : path;
}

export function getCustomerReturnPath(value: string | null | undefined, fallback = CUSTOMER_ROOT) {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith(CUSTOMER_ROOT) || candidate.startsWith("//")) return fallback;
  return candidate;
}

export function buildProductPath(activityId: string, returnTo?: string, outletId?: string, source?: string) {
  const path = `/customer/products/${encodeURIComponent(activityId)}`;
  const safeReturnTo = returnTo ? getCustomerReturnPath(returnTo) : null;
  const params = new URLSearchParams();
  const effectiveSource = source || (safeReturnTo && safeReturnTo.includes("/customer/vendor") ? "vendor" : undefined);
  if (effectiveSource) params.set("source", effectiveSource);
  if (outletId) params.set("outletId", outletId);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const buildActivityPath = buildProductPath;

export function getVendorHref(vendorId: string) {
  return `/customer/vendors/${encodeURIComponent(vendorId)}`;
}
