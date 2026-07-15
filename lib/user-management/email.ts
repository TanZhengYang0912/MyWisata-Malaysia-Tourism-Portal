import type { AccountEmailType } from "@/lib/email/templates";
import type { UserManagementAction } from "@/lib/user-management/types";

const ACTION_EMAILS: Partial<Record<UserManagementAction, AccountEmailType>> = {
  suspend: "account_suspended",
  unsuspend: "account_unsuspended",
  soft_delete: "account_deleted",
  restore: "account_restored",
};

export function getUserManagementEmailType(action: UserManagementAction): AccountEmailType | null {
  return ACTION_EMAILS[action] ?? null;
}
