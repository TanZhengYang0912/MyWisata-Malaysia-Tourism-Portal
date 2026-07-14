import type { Role } from '@/backend/core/types';

type RoleRelation = { name?: string | null } | { name?: string | null }[] | null | undefined;
export type DemoRoleAssignment = { roles?: RoleRelation };

const ROLE_PRIORITY: Record<Role, number> = {
  super_admin: 0,
  admin: 1,
  approver: 2,
  vendor_owner: 3,
  outlet_manager: 4,
  customer: 5,
};

function relationName(relation: RoleRelation) {
  const value = Array.isArray(relation) ? relation[0] : relation;
  return value?.name as Role | undefined;
}

export function pickDemoRole(assignments: DemoRoleAssignment[]): Role {
  return assignments
    .map((assignment) => relationName(assignment.roles))
    .filter((role): role is Role => role !== undefined && role in ROLE_PRIORITY)
    .sort((left, right) => ROLE_PRIORITY[left] - ROLE_PRIORITY[right])[0] || 'customer';
}

export function pickDemoAssignment<T extends DemoRoleAssignment>(assignments: T[]): T | undefined {
  const role = pickDemoRole(assignments);
  return assignments.find((assignment) => relationName(assignment.roles) === role);
}
