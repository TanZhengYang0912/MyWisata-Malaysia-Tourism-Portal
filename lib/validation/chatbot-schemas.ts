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

// ── Admin ticket status update (Step 9) ──────────────────────

export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
}).strict();

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
