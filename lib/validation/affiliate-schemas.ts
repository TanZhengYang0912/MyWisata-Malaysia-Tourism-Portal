// P4 — Member 4: Affiliate/sharing validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()

import { z } from 'zod';

const uuid = z.string().uuid();

// ── Share tracking (Step 3) ─────────────────────────────────

export const shareEventSchema = z.object({
  productId: uuid,
  platform: z.enum(['native', 'copy_link']),
}).strict();

export type ShareEventInput = z.infer<typeof shareEventSchema>;

// ── Dev purchase simulator (Step 5) ─────────────────────────

export const simulatePurchaseSchema = z.object({
  productId: uuid,
}).strict();

export type SimulatePurchaseInput = z.infer<typeof simulatePurchaseSchema>;

// ── Tiered commission (Phase 2, Feature B) ──────────────────

export const updateTierSchema = z.object({
  // Percentage, 0..100 — e.g. 5 for 5%. Converted to a 0..1 fraction before storage.
  ratePercent: z.number().min(0).max(100).optional(),
  minReferrals: z.number().int().min(0).optional(),
}).strict().refine((data) => data.ratePercent !== undefined || data.minReferrals !== undefined, {
  message: 'Provide at least one of ratePercent or minReferrals',
});

export type UpdateTierInput = z.infer<typeof updateTierSchema>;

// ── Fraud flag review (Phase 2, Feature C) ──────────────────

export const reviewFraudFlagSchema = z.object({
  action: z.enum(['dismiss', 'confirm']),
}).strict();

export type ReviewFraudFlagInput = z.infer<typeof reviewFraudFlagSchema>;

// ── Link reactivation (Phase 2, Feature C) ──────────────────
// Re-enabling is always a manual admin action — there is no automatic path,
// only auto-disable. See lib/affiliate/fraud.ts::reactivateLink().

export const reactivateLinkSchema = z.object({
  action: z.literal('reactivate'),
}).strict();

export type ReactivateLinkInput = z.infer<typeof reactivateLinkSchema>;
