// P-TMF (Trust & Money Flow) — Input validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()
// before hitting the DB. Never trust `await request.json()` directly.

import { z } from 'zod';

// ── Common building blocks ─────────────────────────────────

const uuid    = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');
const rmMoney = z.number().finite().min(0.01).max(100_000).multipleOf(0.01);
const shortId = z.string().min(1).max(128);

// ── KYC ────────────────────────────────────────────────────

export const kycSubmitSchema = z.object({
  documentType: z.enum(['national_id', 'passport', 'driving_license']),
  documentUrl:  z.string().url().max(2000),
}).strict();

export const kycReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
}).strict().refine(
  (data) => data.action === 'approve' || (data.reason && data.reason.length >= 10),
  { message: 'Reject requires a reason of at least 10 characters', path: ['reason'] },
);

// ── Vendor Recommendation ──────────────────────────────────

export const recommendationSubmitSchema = z.object({
  vendorName:    z.string().trim().min(3).max(255),
  vendorAddress: z.string().trim().max(500).optional(),
  description:   z.string().trim().min(20).max(2000),
  categoryId:    uuid.optional(),
}).strict();

export const recommendationReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
}).strict();

export const recommendationConvertSchema = z.object({
  vendorId:    uuid,
  bonusAmount: rmMoney.optional().default(12.50),
}).strict();

// ── Wallet & Withdrawal ────────────────────────────────────

export const withdrawalSubmitSchema = z.object({
  amount:        rmMoney.min(10),   // minimum RM 10 withdrawal
  destinationId: uuid.optional(),
}).strict();

export const withdrawalApproveSchema = z.object({
  action: z.enum(['approve', 'reject', 'hold']),
  note:   z.string().max(500).optional(),
}).strict().refine(
  (data) => data.action !== 'reject' || (data.note && data.note.length >= 10),
  { message: 'Reject requires a note of at least 10 characters', path: ['note'] },
);

// ── Idempotency ────────────────────────────────────────────

export const idempotencyHeaderSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).or(z.string().min(16).max(128));

// ── Response envelope ──────────────────────────────────────

export function apiOk<T>(data: T, init?: { status?: number }) {
  return Response.json({ data, error: null }, { status: init?.status ?? 200 });
}

export function apiFail(code: string, message: string, status = 400, details?: unknown) {
  return Response.json({ data: null, error: { code, message, details } }, { status });
}

/**
 * Parse and validate request body. On failure, returns a 422 response with
 * Zod's flattened error output — safe to return to client.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return { ok: false, response: apiFail('INVALID_JSON', 'Body is not valid JSON', 400) }; }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: apiFail(
        'VALIDATION_FAILED',
        'Request body failed validation',
        422,
        result.error.flatten(),
      ),
    };
  }
  return { ok: true, data: result.data };
}

// Export inferred types for use in handlers
export type KycSubmit             = z.infer<typeof kycSubmitSchema>;
export type KycReview             = z.infer<typeof kycReviewSchema>;
export type RecommendationSubmit  = z.infer<typeof recommendationSubmitSchema>;
export type RecommendationReview  = z.infer<typeof recommendationReviewSchema>;
export type RecommendationConvert = z.infer<typeof recommendationConvertSchema>;
export type WithdrawalSubmit      = z.infer<typeof withdrawalSubmitSchema>;
export type WithdrawalApprove     = z.infer<typeof withdrawalApproveSchema>;
