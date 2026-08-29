const PUBLIC_CUSTOMER_ROOTS = [
  "/customer/recommendations",
  "/customer/wallet",
  "/customer/affiliate",
  "/customer/for-you",
] as const;

const PUBLIC_CUSTOMER_PREFIXES = [
  "/customer/explore",
  "/customer/partners",
  "/customer/search",
  "/customer/activity/",
  "/customer/vendor/",
  "/customer/destination/",
  "/customer/place/",
  "/customer/experience/",
  "/customer/outlet/",
] as const;

/** Customer surfaces that are safe to render before sign-in. */
export function isPublicCustomerPath(pathname: string): boolean {
  if (PUBLIC_CUSTOMER_ROOTS.includes(pathname as (typeof PUBLIC_CUSTOMER_ROOTS)[number])) return true;
  return PUBLIC_CUSTOMER_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return pathname.startsWith(prefix);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}
