export const USER_MANAGEMENT_PAGE_SIZES = [15, 25, 50, 100] as const;

export type UserManagementPageSize = (typeof USER_MANAGEMENT_PAGE_SIZES)[number];
export type UserManagementAction = "clear_bio_restriction" | "suspend" | "unsuspend" | "soft_delete" | "restore";
export type UserManagementStatus = "active" | "suspended" | "deleted";
export type UserManagementKycStatus = "unverified" | "pending" | "approved" | "rejected";
export type UserManagementRole = "customer" | "vendor_owner" | "outlet_manager";

export interface UserManagementFilters {
  page: number;
  pageSize: UserManagementPageSize;
  search: string;
  role: UserManagementRole | null;
  status: UserManagementStatus | null;
  kycStatus: UserManagementKycStatus | null;
  bioLocked: boolean | null;
}

export interface UserManagementListItem {
  id: string;
  email: string;
  fullName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserManagementRole;
  roles: UserManagementRole[];
  status: UserManagementStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  kycStatus: UserManagementKycStatus;
  bioViolationCount: number;
  bioCooldownUntil: string | null;
  createdAt: string;
}

export interface UserManagementListResponse {
  items: UserManagementListItem[];
  total: number;
  page: number;
  pageSize: UserManagementPageSize;
  totalPages: number;
}

export interface UserManagementDetail extends UserManagementListItem {
  phone: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  pendingWithdrawalCount: number;
  auditHistory: Array<{ action: string; note: string | null; createdAt: string; actorId: string | null }>;
}
