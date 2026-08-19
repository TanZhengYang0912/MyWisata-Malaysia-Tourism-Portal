import type { Role } from '@/backend/core/types';

/**
 * Fixed display order for the demo-account role filter — matches the
 * privilege ordering already used by pickDemoRole in demo-user-role.ts.
 */
const ROLE_ORDER: Role[] = ['super_admin', 'admin', 'approver', 'vendor_owner', 'outlet_manager', 'customer'];

/**
 * Which roles are actually present in this account list, in ROLE_ORDER.
 * Never returns a role with zero matching accounts — a filter pill for an
 * empty category would be dead UI.
 */
export function demoAccountRoleCategories(users: { role: Role }[]): Role[] {
  const present = new Set(users.map((user) => user.role));
  return ROLE_ORDER.filter((role) => present.has(role));
}

/** Accounts matching `category`, or every account when `category` is null. */
export function filterDemoAccountsByRole<T extends { role: Role }>(users: T[], category: Role | null): T[] {
  return category ? users.filter((user) => user.role === category) : users;
}
