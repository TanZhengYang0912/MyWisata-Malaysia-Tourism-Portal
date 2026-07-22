// P4 — Member 4: Chatbot validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()

import { z } from 'zod';

export const chatbotAskSchema = z.object({
  sessionKey: z.string().min(1).max(64).optional(),
  question: z.string().trim().min(1).max(500),
}).strict();

export type ChatbotAskInput = z.infer<typeof chatbotAskSchema>;

// ── Customer-controlled feedback (CLAUDE-CHATBOT-FEEDBACK.md) ──────────────
// One row per bot message, upserted by messageId: the first call (a
// helpful y/n click, or the automatic "couldn't answer" record) creates the
// row; a later "open a ticket" call only ever sets openedTicket on the same
// row. botAnswered is required to create the row, optional to update it.

export const chatbotFeedbackSchema = z.object({
  sessionKey: z.string().min(1).max(64).optional(),
  messageId: z.string().uuid(),
  question: z.string().trim().max(500).optional(),
  botAnswered: z.boolean().optional(),
  helpful: z.boolean().nullable().optional(),
  openedTicket: z.boolean().optional(),
}).strict();

export type ChatbotFeedbackInput = z.infer<typeof chatbotFeedbackSchema>;

// ── Ticket escalation (Step 8) ──────────────────────────────

export const supportTicketSchema = z.object({
  sessionKey: z.string().min(1).max(64).optional(),
  withdrawalId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(2000),
}).strict();

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;

// ── Admin ticket status update (Step 9), extended with a manual category
// override (CLAUDE-FIXES-2.md item 6: "let the admin manually override the
// category on any ticket — AI classification is a helper, not an authority") ──

export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  category: z.enum(['booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general']).optional(),
}).strict().refine((data) => data.status !== undefined || data.category !== undefined, {
  message: 'Provide at least one of status or category',
});

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

// ── KB editor (Phase 2, Feature A) ──────────────────────────

const kbDocumentFields = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).default([]),
  category: z.string().trim().min(1).max(50).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createKbDocumentSchema = kbDocumentFields.strict();
export type CreateKbDocumentInput = z.infer<typeof createKbDocumentSchema>;

export const updateKbDocumentSchema = kbDocumentFields.partial().strict();
export type UpdateKbDocumentInput = z.infer<typeof updateKbDocumentSchema>;

// ── Ticket replies (CLAUDE-FIXES.md Fix 2) ──────────────────

export const createTicketReplySchema = z.object({
  body: z.string().trim().min(1).max(2000),
}).strict();

export type CreateTicketReplyInput = z.infer<typeof createTicketReplySchema>;
