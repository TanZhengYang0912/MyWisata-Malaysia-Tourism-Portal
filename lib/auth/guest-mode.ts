import { isPublicCustomerPath } from "@/lib/auth/public-customer-paths";

export const GUEST_EXPLORE_PATH = "/guest/explore";

/** Private in-app link destinations that need guest confirmation before navigation. */
export function guestProtectedCustomerPath(href: string, baseUrl: string): string | null {
  try {
    const base = new URL(baseUrl);
    const target = new URL(href, base);
    if (target.origin !== base.origin || target.username || target.password) return null;
    if (target.pathname !== "/customer" && !target.pathname.startsWith("/customer/")) return null;
    if (isPublicCustomerPath(target.pathname)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

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
