import type { Role } from "@/backend/core/types";

export const GUEST_EXPLORE_PATH = "/customer";

const ROUTE_AREA_BY_ROLE: Record<Role, "/admin" | "/vendor" | "/customer"> = {
  admin: "/admin",
  approver: "/admin",
  super_admin: "/admin",
  vendor_owner: "/vendor",
  outlet_manager: "/vendor",
  customer: "/customer",
};

export const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/customer",
  vendor_owner: "/vendor/dashboard",
  outlet_manager: "/vendor/dashboard",
  admin: "/admin/dashboard",
  approver: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

function routeArea(path: string): "/admin" | "/vendor" | "/customer" | null {
  return (["/admin", "/vendor", "/customer"] as const)
    .find((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) ?? null;
}

export function postLoginPath(next: string | null, role?: Role): string | null {
  const safePath = next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
  if (!safePath || !role) return safePath;

  const area = routeArea(safePath);
  return area && area !== ROUTE_AREA_BY_ROLE[role] ? null : safePath;
}

export function postLoginDestination(next: string | null, role: Role): string {
  return postLoginPath(next, role) ?? HOME_BY_ROLE[role];
}

export function guestLoginHref(returnPath: string): string {
  return `/login?next=${encodeURIComponent(postLoginPath(returnPath) ?? GUEST_EXPLORE_PATH)}`;
}

export function guestVendorHref(vendorId: string): string {
  return `/customer/vendor/${encodeURIComponent(vendorId)}`;
}
