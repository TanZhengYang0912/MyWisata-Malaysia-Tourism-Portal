const PRIVATE_CUSTOMER_PATHS = new Set([
  "/customer/calendar",
  "/customer/kyc",
  "/customer/notifications",
  "/customer/phone",
  "/customer/preferences",
  "/customer/profile",
  "/customer/profile/register-vendor",
  "/customer/saved",
  "/customer/support",
  "/customer/trip",
  "/customer/verification",
  "/customer/wishlist",
]);

const PRIVATE_CUSTOMER_PREFIXES = [
  "/customer/bookings/",
  "/customer/chat",
  "/customer/checkout",
  "/customer/orders",
  "/customer/recommendations/",
  "/customer/support/",
  "/customer/trip/",
  "/customer/wallet/",
];

/** Customer surfaces that are safe to render before sign-in by default. */
export function isPublicCustomerPath(pathname: string): boolean {
  if (pathname !== "/customer" && !pathname.startsWith("/customer/")) return false;
  if (PRIVATE_CUSTOMER_PATHS.has(pathname)) return false;
  return !PRIVATE_CUSTOMER_PREFIXES.some((prefix) => (
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}
