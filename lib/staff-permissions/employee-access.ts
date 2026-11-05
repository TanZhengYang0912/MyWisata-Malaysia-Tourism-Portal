import { z } from "zod";

// PostgreSQL accepts any UUID-shaped 128-bit value. Some existing seeded demo
// identities use non-RFC version bits, so validation must match the DB type's
// syntax rather than Zod's stricter RFC UUID version/variant checks.
export const postgresUuidSchema = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

export const staffEmployeeSchema = z.object({
  id: postgresUuidSchema, name: z.string(), email: z.string(), status: z.string(), roles: z.array(z.string()),
});
export const staffEmployeeAccessSchema = z.object({
  id: postgresUuidSchema, name: z.string(), email: z.string(), status: z.string(), coarseRoles: z.array(z.string()),
  assignments: z.array(z.object({
    id: postgresUuidSchema, roleId: postgresUuidSchema, roleName: z.string(),
    isSystem: z.boolean(), isActive: z.boolean(), createdAt: z.string().nullable(),
  })),
  sources: z.array(z.object({
    permissionKey: z.string(), sourceType: z.enum(["super_admin", "assignment", "legacy_role"]),
    sourceId: postgresUuidSchema.nullable(), sourceName: z.string(),
  })),
});
export const staffEmployeePageSchema = z.object({
  items: z.array(staffEmployeeSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(),
  pageSize: z.number().int().positive(), totalPages: z.number().int().nonnegative(),
});
export type StaffEmployeeAccess = z.infer<typeof staffEmployeeAccessSchema>;
export type StaffEmployeePage = z.infer<typeof staffEmployeePageSchema>;
