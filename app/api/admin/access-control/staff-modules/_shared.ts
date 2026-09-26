import { z } from "zod";

import { apiFail } from "@/lib/validation/schemas";

const permissionKeySchema = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
const moduleKeySchema = z.string().regex(/^[a-z][a-z0-9_]*$/);
const internalAdminHrefSchema = z.string().regex(/^\/admin(?:\/.*)?$/).refine((href) => !/[?#]/.test(href));
const nullableTrimmedString = (maximum: number) => z.string().trim().max(maximum).nullable().optional().default(null);

export const staffModuleCreateSchema = z.object({
  key: moduleKeySchema,
  label: z.string().trim().min(1).max(100),
  description: nullableTrimmedString(1000),
  sectionKey: moduleKeySchema,
  sectionLabel: z.string().trim().min(1).max(100),
  sectionSortOrder: z.number().int().min(0).max(10_000),
  href: internalAdminHrefSchema,
  iconKey: z.string().regex(/^[a-z][a-z0-9-]*$/),
  sortOrder: z.number().int().min(0).max(10_000),
  permissionKeys: z.array(permissionKeySchema).max(100)
    .refine((keys) => new Set(keys).size === keys.length, "Permission keys must be unique"),
  groupKey: moduleKeySchema.nullable().optional().default(null),
  reason: z.string().trim().min(10).max(500),
}).strict();

export function moduleFailure(message: string) {
  if (message.includes("super_admin_required")) return apiFail("FORBIDDEN", "Super Admin access required", 403);
  if (message.includes("staff_module_not_found") || message.includes("staff_module_group_not_found")) {
    return apiFail("NOT_FOUND", "The requested Staff Module record was not found", 404);
  }
  if (message.includes("23505") || message.includes("duplicate key")) {
    return apiFail("CONFLICT", "The Staff Module conflicts with an existing key or route", 409);
  }
  if (message.includes("system_module_group_protected")) {
    return apiFail("SYSTEM_GROUP_PROTECTED", "The system Module group cannot be changed", 409);
  }
  if (message.includes("invalid_staff_module") || message.includes("invalid_permission_key")
      || message.includes("duplicate_permission_key") || message.includes("staff_reason_required")) {
    return apiFail("VALIDATION_FAILED", "Request body failed validation", 422);
  }
  return apiFail("STAFF_MODULE_OPERATION_FAILED", "Unable to complete the Staff Module operation", 500);
}
