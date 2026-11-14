import type { Role } from "@/backend/core/types";
import { postLoginPath } from "@/lib/auth/guest-mode";
import { staffMfaDestination, staffVerificationDestination } from '@/lib/auth/staff-route-boundaries';

const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/customer",
  vendor_owner: "/vendor/announcements",
  outlet_manager: "/vendor/announcements",
  event_vendor: "/vendor/announcements",
  admin: "/admin/dashboard",
  approver: "/admin/withdrawals",
  staff: "/staff",
  super_admin: "/admin/dashboard",
};

export function isWalletApproverPath(pathname: string): boolean {
  return pathname === "/admin/withdrawals" || pathname.startsWith("/admin/withdrawals/");
}

export function postLoginDestination(role: Role, next?: string | null, staffVerified = false, staffPasskeyRequired = true, staffMfaRequired = false): string {
  const staff = ['admin', 'approver', 'staff', 'super_admin'].includes(role);
  const home = staff && staffMfaRequired ? staffMfaDestination(HOME_BY_ROLE[role])
    : staff && staffPasskeyRequired && !staffVerified ? staffVerificationDestination(HOME_BY_ROLE[role]) : HOME_BY_ROLE[role];
  const safeNext = postLoginPath(next ?? null);
  if (!safeNext) return home;

  const parsedNext = new URL(safeNext, "https://mylawatan.invalid");
  const pathname = parsedNext.pathname;

  // Preserve only essential post-auth completion flows (password reset or invitation tokens)
  if (pathname === "/reset-password" || pathname === "/vendor-invite" || pathname.startsWith("/outlet-manager-invitations/") || pathname.startsWith("/staff-invitations/") || pathname === "/event-staff" || pathname.startsWith("/event-staff/")) {
    return `${pathname}${parsedNext.search}${parsedNext.hash}`;
  }

  // A customer whose session expired while reporting a support conversation
  // should return to that ticket after sign-in. Keep this allowlist narrow and
  // reject extra query/hash data so `next` cannot become an open redirect.
  if (role === "customer" && !parsedNext.search && !parsedNext.hash
      && /^\/customer\/support\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname)) {
    return pathname;
  }

  // Admin Support keeps the selected ticket in a single `ticket` query
  // parameter. Preserve only that exact route shape for authenticated staff;
  // never accept arbitrary admin paths or extra query/hash data.
  const adminTicketId = parsedNext.searchParams.get("ticket");
  if (staff && pathname === "/admin/support" && !parsedNext.hash
      && parsedNext.searchParams.size === 1
      && adminTicketId
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminTicketId)) {
    const adminSupportPath = `/admin/support?ticket=${adminTicketId}`;
    if (staffMfaRequired) return staffMfaDestination(adminSupportPath);
    if (staffPasskeyRequired && !staffVerified) return staffVerificationDestination(adminSupportPath);
    return adminSupportPath;
  }

  // All other logins (customer, vendor, admin, approver) ALWAYS land on their fixed role home page
  return home;
}
