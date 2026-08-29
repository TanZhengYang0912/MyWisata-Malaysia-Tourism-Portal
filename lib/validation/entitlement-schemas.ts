import { z } from "zod";

import { CAPABILITY_KEYS } from "@/lib/entitlements/types";

const uuidSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(10).max(2000);
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);
const optionalBooleanQuerySchema = z.enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const capabilityMetadataSchema = z.object({
  key: z.enum(CAPABILITY_KEYS),
  category: z.enum(["platform", "commerce", "ai", "recommendation", "affiliate", "wallet"]),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  customerVisible: z.boolean(),
  manuallyAssignable: z.boolean(),
  enabled: z.boolean(),
}).strict();

const booleanRequirementSchema = z.object({
  alternativeGroup: z.number().int().positive(),
  factKey: z.enum(["email_verified", "phone_verified", "profile_complete"]),
  operator: z.enum(["eq", "not_eq"]),
  expectedValue: z.boolean(),
}).strict();

const kycRequirementSchema = z.object({
  alternativeGroup: z.number().int().positive(),
  factKey: z.literal("kyc_status"),
  operator: z.enum(["eq", "not_eq"]),
  expectedValue: z.enum(["unverified", "pending", "approved", "rejected"]),
}).strict();

const accountRequirementSchema = z.object({
  alternativeGroup: z.number().int().positive(),
  factKey: z.literal("account_status"),
  operator: z.enum(["eq", "not_eq"]),
  expectedValue: z.enum(["active", "suspended", "deleted"]),
}).strict();

const membershipExpectedValueSchema = z.union([
  z.string().trim().min(1).max(255),
  z.array(z.string().trim().min(1).max(255)).min(1).max(50),
]);

const membershipRequirementSchema = z.object({
  alternativeGroup: z.number().int().positive(),
  factKey: z.enum(["role", "plan", "partner"]),
  operator: z.enum(["eq", "not_eq", "contains"]),
  expectedValue: membershipExpectedValueSchema,
}).strict();

export const policyRequirementSchema = z.discriminatedUnion("factKey", [
  booleanRequirementSchema,
  kycRequirementSchema,
  accountRequirementSchema,
  membershipRequirementSchema,
]);

export const createPolicyVersionSchema = z.object({
  effect: z.enum(["allow", "deny"]),
  effectiveFrom: timestampSchema,
  effectiveUntil: nullableTimestampSchema,
  requirements: z.array(policyRequirementSchema).max(100),
  reason: reasonSchema,
}).strict().superRefine((value, context) => {
  if (value.effectiveUntil && Date.parse(value.effectiveUntil) <= Date.parse(value.effectiveFrom)) {
    context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "effectiveUntil must be after effectiveFrom" });
  }

  const uniqueRequirements = new Set<string>();
  for (const requirement of value.requirements) {
    const key = `${requirement.alternativeGroup}:${requirement.factKey}`;
    if (uniqueRequirements.has(key)) {
      context.addIssue({ code: "custom", path: ["requirements"], message: "Duplicate fact in an alternative group" });
      return;
    }
    uniqueRequirements.add(key);
  }
});

export const policyDecisionSchema = z.object({ reason: reasonSchema }).strict();

export const rollbackPolicySchema = z.object({
  targetVersion: z.number().int().positive(),
  reason: reasonSchema,
}).strict();

export const assignmentSchema = z.object({
  subjectType: z.enum(["user", "role", "plan", "partner"]),
  subjectId: z.string().trim().min(1).max(255),
  capabilityKey: z.enum(CAPABILITY_KEYS),
  effect: z.enum(["allow", "deny"]),
  startsAt: timestampSchema,
  expiresAt: nullableTimestampSchema,
  reason: reasonSchema,
}).strict().superRefine((value, context) => {
  if (value.subjectType === "user" && !uuidSchema.safeParse(value.subjectId).success) {
    context.addIssue({ code: "custom", path: ["subjectId"], message: "User subjectId must be a UUID" });
  }
  if (value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "expiresAt must be after startsAt" });
  }
});

export const revokeAssignmentSchema = z.object({ reason: reasonSchema }).strict();

export const capabilitiesFiltersSchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: z.string().trim().max(160).optional(),
  category: z.enum(["platform", "commerce", "ai", "recommendation", "affiliate", "wallet"]).optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  enabled: optionalBooleanQuerySchema,
  customerVisible: optionalBooleanQuerySchema,
}).strict();

export const policiesFiltersSchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: z.string().trim().max(160).optional(),
  capabilityKey: z.enum(CAPABILITY_KEYS).optional(),
  scope: z.enum(["customer", "admin", "system"]).optional(),
  status: z.enum(["draft", "pending_approval", "scheduled", "active", "retired"]).optional(),
}).strict();

export const assignmentsFiltersSchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: z.string().trim().max(255).optional(),
  subjectType: z.enum(["user", "role", "plan", "partner"]).optional(),
  capabilityKey: z.enum(CAPABILITY_KEYS).optional(),
  effect: z.enum(["allow", "deny"]).optional(),
  status: z.enum(["active", "scheduled", "expired", "revoked"]).optional(),
}).strict();

export const auditLogFiltersSchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  actorId: uuidSchema.optional(),
  actionPrefix: z.string().trim().min(1).max(100).regex(/^[a-z0-9_.-]+$/i).optional(),
  entityType: z.string().trim().min(1).max(50).regex(/^[a-z0-9_-]+$/i).optional(),
  entityId: uuidSchema.optional(),
  capabilityKey: z.enum(CAPABILITY_KEYS).optional(),
  policyId: uuidSchema.optional(),
  dateFrom: timestampSchema.optional(),
  dateTo: timestampSchema.optional(),
  traceReference: z.string().trim().min(1).max(160).regex(/^[a-z0-9_.:-]+$/i).optional(),
}).strict().superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && Date.parse(value.dateTo) < Date.parse(value.dateFrom)) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "dateTo must be on or after dateFrom" });
  }
});

export const idParamSchema = uuidSchema;

export function parseSearchParams<T extends z.ZodTypeAny>(url: string, schema: T) {
  const searchParams = new URL(url).searchParams;
  const duplicates = [...new Set(searchParams.keys())].filter((key) => searchParams.getAll(key).length > 1);
  if (duplicates.length) {
    return { success: false as const, error: new Error(`Duplicate query parameter: ${duplicates[0]}`) };
  }
  return schema.safeParse(Object.fromEntries(searchParams));
}
