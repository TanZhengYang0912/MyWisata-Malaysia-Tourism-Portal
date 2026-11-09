import { z } from "zod";

export const staffJitRequestSchema = z.object({
  requestKey: z.string().uuid(),
  permissionKey: z.literal("admin.kyc.review"),
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
  reason: z.string().trim().min(10).max(500),
}).strict();

export const staffJitActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), proofId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("withdraw"), reason: z.string().trim().min(10).max(500) }).strict(),
  z.object({ action: z.literal("end"), reason: z.string().trim().min(10).max(500) }).strict(),
]);

export const adminStaffJitDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "revoke"]),
  reason: z.string().trim().min(10).max(500),
}).strict();

export function staffJitFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("staff_jit_admin_assurance_required")) return { code: "STAFF_PASSKEY_REQUIRED", status: 403 };
  if (message.includes("staff_jit_self_approval_forbidden") || message.includes("staff_jit_self_revocation_forbidden")) return { code: "FORBIDDEN", status: 403 };
  if (message.includes("staff_jit_auth_required") || message.includes("staff_jit_aal2_required")) return { code: "FORBIDDEN", status: 403 };
  if (message.includes("staff_jit_invalid") || message.includes("staff_jit_reason_required")) return { code: "VALIDATION_FAILED", status: 422 };
  if (message.includes("staff_jit_ineligible") || message.includes("staff_jit_disabled")) return { code: "STAFF_JIT_UNAVAILABLE", status: 409 };
  if (message.includes("staff_jit_idempotency_conflict")) return { code: "IDEMPOTENCY_CONFLICT", status: 409 };
  if (message.includes("staff_jit_request_open")) return { code: "STAFF_JIT_REQUEST_OPEN", status: 409 };
  if (message.includes("staff_jit_request_unavailable")) return { code: "STAFF_JIT_REQUEST_UNAVAILABLE", status: 409 };
  if (message.includes("super_admin_required")) return { code: "FORBIDDEN", status: 403 };
  return { code: "STAFF_JIT_UNAVAILABLE", status: 503 };
}
