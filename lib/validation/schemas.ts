import { checkoutContactSchema } from "@/lib/checkout/contact";
// P-TMF (Trust & Money Flow) — Input validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()
// before hitting the DB. Never trust `await request.json()` directly.

import { z } from 'zod';
import { log } from '@/lib/log';
import { createRequestId } from '@/lib/request-id';
import { validateReviewReason } from '@/lib/kyc/review-reasons';
import { KYC_REVIEW_REASON_CODES } from '@/lib/kyc/types';

// ── Common building blocks ─────────────────────────────────

export const databaseUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Invalid UUID',
);
const uuid = databaseUuidSchema;
const rmMoney = z.number().finite().min(0.01).max(100_000).multipleOf(0.01);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const shortId = z.string().min(1).max(128);

// ── KYC ────────────────────────────────────────────────────

export const kycSubmitSchema = z.object({
  documentType: z.enum(['national_id', 'passport', 'driving_license']),
  documentUrl:  z.string().url().max(2000),
}).strict();

export const kycReviewSchema = z.object({
  submissionId: uuid,
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
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

// ── Vendor Event Promotion (admin review) ───────────────────
// Submission/resubmission schemas live in lib/validation/vendor-schemas.ts —
// vendor-facing input. This one is the admin decision.

export const eventPromotionReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes', 'pause', 'resume']),
  note: z.string().trim().min(10).max(1000).optional(),
}).strict().refine(
  (data) => data.action === 'approve' || data.action === 'pause' || data.action === 'resume' || Boolean(data.note),
  { message: 'A note of at least 10 characters is required for reject or request changes', path: ['note'] },
);

export type EventPromotionReview = z.infer<typeof eventPromotionReviewSchema>;

export const eventPromotionSettingsPatchSchema = z.object({
  costPerDaySen: z.number().int().min(0).max(100_000_00).optional(),
  maxConcurrent: z.number().int().min(1).max(50).optional(),
}).strict().refine(
  (data) => data.costPerDaySen !== undefined || data.maxConcurrent !== undefined,
  { message: 'At least one setting must be provided' },
);

export type EventPromotionSettingsPatch = z.infer<typeof eventPromotionSettingsPatchSchema>;

// ── Vendor-Fair Event: campaign vendor registration (admin review) ──────
// Submission/resubmission schemas live in lib/validation/vendor-schemas.ts —
// vendor-facing input. This one is the admin decision. Same shape as
// eventPromotionReviewSchema (approve/reject/request_changes + conditional
// note) — kept as a separate export since it's a distinct governance flow.

export const campaignRegistrationReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes']),
  note: z.string().trim().min(10).max(1000).optional(),
  stallNumber: z.string().trim().min(1).max(40).optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict().refine(
  (data) => data.action === 'approve' || Boolean(data.note),
  { message: 'A note of at least 10 characters is required for reject or request changes', path: ['note'] },
).refine((data) => data.action !== 'approve' || Boolean(data.stallNumber && data.expectedUpdatedAt),
  { message: 'Confirm a booth number and reload the current application before approval', path: ['stallNumber'] });

export type CampaignRegistrationReview = z.infer<typeof campaignRegistrationReviewSchema>;

// ── Vendor-Fair Event: announcements (super admin -> vendors) ───────────

export const vendorAnnouncementCreateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(5000),
  senderCode: z.string().trim().min(1).max(20).default('ADMIN'),
  campaignId: databaseUuidSchema.nullable().optional(),
}).strict();

export type VendorAnnouncementCreate = z.infer<typeof vendorAnnouncementCreateSchema>;

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

// ── Place community ───────────────────────────────────────

export const placeCommentCreateSchema = z.object({
  body: z.string().trim().min(8).max(600),
  isAnonymous: z.boolean().optional().default(false),
}).strict();

export const placeCommentDeleteSchema = z.object({
  commentId: uuid,
}).strict();

export const productReviewSubmitSchema = z.object({
  orderItemId: uuid,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(255).optional(),
  body: z.string().trim().max(600).optional(),
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

/** Reserve-now checkout for one event item: price, stock and slot are decided in SQL. */
export const eventCheckoutSchema = z.object({
  contact: checkoutContactSchema.optional(),
  listingId: uuid,
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: uuid,
  quantity: z.number().int().min(1).max(20),
  paymentMethod: z.enum(['stripe_card', 'ewallet', 'bank_transfer', 'wallet', 'wallet_split', 'mock_card', 'free_reservation']),
  paymentProvider: z.enum([
    'tng_ewallet_simulator',
    'grabpay_simulator',
    'bank_transfer_simulator',
    'toyyibpay',
  ]).nullable().optional(),
  idempotencyKey: idempotencyHeaderSchema,
}).strict();

/** Guest details are captured per accommodation cart line, never from checkout. */
export const stayBookingDetailsSchema = z.object({
  primaryGuestName: z.string().trim().min(1).max(100),
  additionalGuestNames: z.array(z.string().trim().min(1).max(100)).max(19).optional(),
  adults: z.number().int().min(1).max(20),
  estimatedArrival: z.enum(['unknown', '15:00-18:00', '18:00-21:00', 'after-21:00']),
  specialRequest: z.string().trim().max(500).nullable().optional(),
}).strict().superRefine((details, context) => {
  if ((details.additionalGuestNames?.length ?? 0) > details.adults - 1) {
    context.addIssue({
      code: 'custom',
      path: ['additionalGuestNames'],
      message: 'Additional guest names cannot exceed the remaining adult count.',
    });
  }
});

export const checkoutPrepareSchema = z.object({
  contact: checkoutContactSchema.optional(),
  selectedKeys: z.array(z.string().min(1).max(300)).max(100).optional(),
  voucherCode: z.string().trim().max(50).nullable().optional(),
  claimId: uuid.nullable().optional(),
  paymentMethod: z.enum(['stripe_card', 'ewallet', 'bank_transfer', 'wallet', 'wallet_split', 'mock_card', 'free_reservation']),
  paymentProvider: z.enum([
    'tng_ewallet_simulator',
    'grabpay_simulator',
    'bank_transfer_simulator',
    'toyyibpay',
  ]).nullable().optional(),
  foodServiceModes: z.array(z.object({
    outletId: uuid,
    mode: z.enum(['dine_in', 'takeaway']),
  }).strict()).max(50).optional(),
  idempotencyKey: idempotencyHeaderSchema,
}).strict();

export const checkoutFinalizeSchema = z.object({
  checkoutSessionId: uuid,
  outcome: z.enum(['succeeded', 'failed', 'cancelled', 'expired']),
}).strict();

// ── AI Budget Guard (lib/customer/budget-guard.ts) ──────────

export const budgetGuardCheckSchema = z.object({
  lines: z.array(z.object({
    productId: uuid,
    qty: z.number().int().min(1).max(99),
  })).min(1).max(50),
  budgetRM: z.number().min(0).max(1_000_000),
  lang: z.enum(['en', 'bm', 'zh']).optional(),
}).strict();

// ── Response envelope ──────────────────────────────────────

export function apiOk<T>(data: T, init?: { status?: number }) {
  return Response.json({ data, error: null }, { status: init?.status ?? 200 });
}

export function apiFail(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
  options: { requestId?: string } = {},
) {
  const exposesInternals = /(?:row.level security|\brls\b|postgres|postgrest|supabase|database|relation ["']|column ["']|constraint|sqlstate|\.env(?:\.|\b)|api key|secret key|storage bucket|permission denied|function\s+[^ ]+\s+does not exist|could not find the function|schema cache|does not exist|invalid input syntax for type)/i.test(message);
  const safeMessage = exposesInternals ? 'The request could not be completed. Please try again, or contact support if the problem continues.' : message;
  const requestId = status >= 500
    ? (options.requestId && /^[A-Za-z0-9:_-]{1,128}$/.test(options.requestId) ? options.requestId : createRequestId())
    : undefined;
  if (requestId) log('error', 'api_failure', { requestId, code });
  return Response.json(
    { data: null, error: { code, message: safeMessage, details: exposesInternals ? undefined : details, ...(requestId ? { requestId } : {}) } },
    { status, headers: requestId ? { 'x-request-id': requestId } : undefined },
  );
}

/**
 * Parse and validate request body. On failure, returns a 422 response with
 * Zod's flattened error output — safe to return to client.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  options: { maxBytes?: number } = {},
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    if (options.maxBytes === undefined) {
      raw = await request.json();
    } else {
      const declaredLength = Number(request.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
        return { ok: false, response: apiFail('REQUEST_TOO_LARGE', 'Request body is too large', 413) };
      }

      const reader = request.body?.getReader();
      const decoder = new TextDecoder();
      let totalBytes = 0;
      let text = '';
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          totalBytes += chunk.value.byteLength;
          if (totalBytes > options.maxBytes) {
            await reader.cancel();
            return { ok: false, response: apiFail('REQUEST_TOO_LARGE', 'Request body is too large', 413) };
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      }
      raw = JSON.parse(text);
    }
  }
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
