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
