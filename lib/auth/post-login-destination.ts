import type { Role } from "@/backend/core/types";
import { postLoginPath } from "@/lib/auth/guest-mode";

const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/customer",
  vendor_owner: "/vendor/dashboard",
  outlet_manager: "/vendor/dashboard",
  admin: "/admin/dashboard",
  approver: "/admin/withdrawals",
  super_admin: "/admin/dashboard",
};

const ROLE_PREFIXES = ["/customer", "/vendor", "/admin"] as const;
const ROLE_NEUTRAL_PATHS = ["/", "/reset-password", "/vendor-invite"] as const;

export function isWalletApproverPath(pathname: string): boolean {
  return pathname === "/admin/withdrawals" || pathname.startsWith("/admin/withdrawals/");
}

function rolePrefix(role: Role): string {
  if (role === "customer") return "/customer";
  if (role === "vendor_owner" || role === "outlet_manager") return "/vendor";
  return "/admin";
}

function isRoleNeutralPath(pathname: string): boolean {
  return ROLE_NEUTRAL_PATHS.includes(pathname as typeof ROLE_NEUTRAL_PATHS[number])
    || pathname.startsWith("/outlet-manager-invitations/");
}

export function postLoginDestination(role: Role, next: string | null): string {
  const safeNext = postLoginPath(next);
  if (!safeNext) return HOME_BY_ROLE[role];

  const parsedNext = new URL(safeNext, "https://mywisata.invalid");
  const pathname = parsedNext.pathname;
  const normalizedNext = `${pathname}${parsedNext.search}${parsedNext.hash}`;
  const requestedPrefix = ROLE_PREFIXES.find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const prefix = rolePrefix(role);
  if (role === "approver" && requestedPrefix === "/admin" && !isWalletApproverPath(pathname)) {
    return HOME_BY_ROLE.approver;
  }
  if (requestedPrefix === prefix || (!requestedPrefix && isRoleNeutralPath(pathname))) {
    return normalizedNext;
  }
  return HOME_BY_ROLE[role];
}
