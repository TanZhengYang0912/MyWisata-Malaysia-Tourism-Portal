export const GUEST_EXPLORE_PATH = "/guest/explore";

export function postLoginPath(next: string | null): string | null {
  return next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

export function guestLoginHref(returnPath: string): string {
  return `/login?next=${encodeURIComponent(postLoginPath(returnPath) ?? GUEST_EXPLORE_PATH)}`;
}

export function guestVendorHref(vendorId: string): string {
  return `/guest/vendor/${encodeURIComponent(vendorId)}`;
}

/**
 * Maps the current /guest/* page to its logged-in /customer/* equivalent,
 * for the guest layout's generic header "Sign In" link — every /guest route
 * has a 1:1 /customer counterpart (activity/[id], vendor/[vendorId], explore),
 * so a plain prefix swap is correct and doesn't need a per-route table.
 * Falls back to /customer/explore for a pathname that isn't under /guest at
 * all (shouldn't happen from within GuestLayout, but never build a broken
 * `next` value from it).
 */
export function guestPathToCustomerPath(pathname: string): string {
  if (!pathname.startsWith("/guest")) return "/customer/explore";
  const rest = pathname.slice("/guest".length);
  return `/customer${rest}` || "/customer/explore";
}
