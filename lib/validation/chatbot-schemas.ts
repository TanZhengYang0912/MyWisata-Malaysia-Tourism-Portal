// P4 — Member 4: Chatbot validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()

import { z } from 'zod';

export const chatbotAskSchema = z.object({
  sessionKey: z.string().min(1).max(64).optional(),
  question: z.string().trim().min(1).max(500),
}).strict();

export type ChatbotAskInput = z.infer<typeof chatbotAskSchema>;

// ── Ticket escalation (Step 8) ──────────────────────────────

export const supportTicketSchema = z.object({
  sessionKey: z.string().min(1).max(64).optional(),
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
