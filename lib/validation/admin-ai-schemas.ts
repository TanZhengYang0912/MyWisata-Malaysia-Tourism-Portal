// P4 — Member 4: Admin AI validation schemas. CLAUDE-ADMIN-AI.md Part 2.
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()

import { z } from 'zod';

export const adminAiDraftSchema = z.object({
  type: z.enum(['onboarding', 'rejection', 'approval', 'custom']),
  context: z.string().trim().min(1).max(2000),
}).strict();

export type AdminAiDraftInput = z.infer<typeof adminAiDraftSchema>;

export const adminAiAskSchema = z.object({
  sessionKey: z.string().min(1).max(64).optional(),
  question: z.string().trim().min(1).max(500),
}).strict();

export type AdminAiAskInput = z.infer<typeof adminAiAskSchema>;

export const adminAiModerationReviewSchema = z.object({
  recommendationId: z.string().uuid(),
}).strict();

export type AdminAiModerationReviewInput = z.infer<typeof adminAiModerationReviewSchema>;
