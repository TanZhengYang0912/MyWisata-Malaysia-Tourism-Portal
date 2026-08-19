// P-TMF (Trust & Money Flow) — Input validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()
// before hitting the DB. Never trust `await request.json()` directly.

import { z } from 'zod';
import { validateReviewReason } from '@/lib/kyc/review-reasons';
import { KYC_REVIEW_REASON_CODES } from '@/lib/kyc/types';

// ── Common building blocks ─────────────────────────────────

const uuid    = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');
const rmMoney = z.number().finite().min(0.01).max(100_000).multipleOf(0.01);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const shortId = z.string().min(1).max(128);

// ── KYC ────────────────────────────────────────────────────

export const kycSubmitSchema = z.object({
  documentType: z.enum(['national_id', 'passport', 'driving_license']),
  documentUrl:  z.string().url().max(2000),
}).strict();

export const kycReviewSchema = z.object({
  userId: uuid,
  action: z.enum(['approve', 'reject', 'request_info']),
  reasonCode: z.enum(KYC_REVIEW_REASON_CODES).optional(),
  reasonDetail: z.string().max(500).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.action === 'approve') {
    if (data.reasonCode !== undefined || data.reasonDetail !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'Approved submissions cannot include a review reason', path: ['reasonCode'] });
    }
    return;
  }

  if (!data.reasonCode) {
    ctx.addIssue({ code: 'custom', message: 'A review reason code is required', path: ['reasonCode'] });
    return;
  }

  const validation = validateReviewReason(data.action, data.reasonCode, data.reasonDetail ?? null);
  if (!validation.ok) {
    ctx.addIssue({ code: 'custom', message: validation.error, path: [validation.error === 'reason_detail_too_short' ? 'reasonDetail' : 'reasonCode'] });
  }
});

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

export const walletSettingsPatchSchema = z.object({
  clearanceDays: z.number().int().min(1).max(30).optional(),
  minAmountSen: z.number().int().min(100).optional(),
  dualApprovalThresholdSen: z.number().int().min(0).optional(),
  escalationHours: z.number().int().min(24).max(168).optional(),
  holdEscalationHours: z.number().int().min(24).max(720).optional(),
  reason: z.string().trim().min(10).max(500),
  reasonCategory: z.string().trim().min(1).default('other'),
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'reason'),
  { message: 'At least one wallet setting must be provided', path: ['reason'] },
);

export const walletApproverPatchSchema = z.object({
  userId: uuid,
  action: z.enum(['grant', 'revoke']),
  reason: z.string().trim().min(10).max(500),
  reasonCategory: z.string().trim().min(1).default('other'),
}).strict();

// ── Idempotency ────────────────────────────────────────────

export const idempotencyHeaderSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).or(z.string().min(16).max(128));

export const checkoutPrepareSchema = z.object({
  selectedKeys: z.array(z.string().min(1).max(300)).max(100).optional(),
  voucherCode: z.string().trim().max(50).nullable().optional(),
  claimId: uuid.nullable().optional(),
  paymentMethod: z.enum(['stripe_card', 'ewallet', 'bank_transfer', 'wallet', 'wallet_split', 'mock_card']),
  paymentProvider: z.enum([
    'tng_ewallet_simulator',
    'grabpay_simulator',
    'bank_transfer_simulator',
  ]).nullable().optional(),
  idempotencyKey: idempotencyHeaderSchema,
}).strict();

export const checkoutFinalizeSchema = z.object({
  checkoutSessionId: uuid,
  outcome: z.enum(['succeeded', 'failed', 'cancelled', 'expired']),
}).strict();

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
