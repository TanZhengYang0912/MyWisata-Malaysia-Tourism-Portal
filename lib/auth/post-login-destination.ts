import type { Role } from "@/backend/core/types";
import { postLoginPath } from "@/lib/auth/guest-mode";

const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/customer",
  vendor_owner: "/vendor/dashboard",
  outlet_manager: "/vendor/dashboard",
  admin: "/admin/dashboard",
  approver: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

function rolePrefix(role: Role): string {
  if (role === "customer") return "/customer";
  if (role === "vendor_owner" || role === "outlet_manager") return "/vendor";
  return "/admin";
}

export function postLoginDestination(role: Role, next: string | null): string {
  const safeNext = postLoginPath(next);
  const prefix = rolePrefix(role);
  if (safeNext && (safeNext === prefix || safeNext.startsWith(`${prefix}/`))) return safeNext;
  return HOME_BY_ROLE[role];
}
