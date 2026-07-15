import type { User } from "@/backend/core/types";

export type AccountGate = "allow" | "restore" | "suspended";

export function accountGate(status: User["status"] | undefined): AccountGate {
  if (status === "deleted") return "restore";
  if (status === "suspended") return "suspended";
  return "allow";
}

export function restoreTier(emailVerified: boolean): User["verificationTier"] {
  return emailVerified ? "email_verified" : "email_unverified";
}

export function canSuspendedAccessPath(pathname: string): boolean {
  return pathname === "/account-suspended" || pathname === "/customer/support" || pathname.startsWith("/customer/support/");
}
