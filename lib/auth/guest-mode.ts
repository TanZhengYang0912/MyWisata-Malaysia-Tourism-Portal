export const GUEST_EXPLORE_PATH = "/guest/explore";

export function postLoginPath(next: string | null): string | null {
  return next?.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function guestLoginHref(returnPath: string): string {
  return `/login?next=${encodeURIComponent(postLoginPath(returnPath) ?? GUEST_EXPLORE_PATH)}`;
}

export function guestVendorHref(vendorId: string): string {
  return `/guest/vendor/${encodeURIComponent(vendorId)}`;
}
