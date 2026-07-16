import { USER_MANAGEMENT_PAGE_SIZES, type UserManagementFilters, type UserManagementKycStatus, type UserManagementPageSize, type UserManagementRole, type UserManagementStatus } from "@/lib/user-management/types";

const ROLES = new Set<UserManagementRole>(["customer", "vendor_owner", "outlet_manager"]);
const STATUSES = new Set<UserManagementStatus>(["active", "suspended", "deleted"]);
const KYC_STATUSES = new Set<UserManagementKycStatus>(["unverified", "pending", "approved", "rejected"]);

function pick<T extends string>(value: string | null, allowed: Set<T>): T | null {
  return value && allowed.has(value as T) ? value as T : null;
}

export function parseUserManagementFilters(searchParams: URLSearchParams): UserManagementFilters {
  const pageValue = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const pageSizeValue = Number.parseInt(searchParams.get("pageSize") ?? "15", 10);
  const pageSize = USER_MANAGEMENT_PAGE_SIZES.includes(pageSizeValue as UserManagementPageSize)
    ? pageSizeValue as UserManagementPageSize
    : 15;

  const bioLockedValue = searchParams.get("bioLocked");
  return {
    page: Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1,
    pageSize,
    search: (searchParams.get("search") ?? "").trim().slice(0, 100),
    role: pick(searchParams.get("role"), ROLES),
    status: pick(searchParams.get("status"), STATUSES),
    kycStatus: pick(searchParams.get("kycStatus"), KYC_STATUSES),
    bioLocked: bioLockedValue === "true" ? true : bioLockedValue === "false" ? false : null,
  };
}
