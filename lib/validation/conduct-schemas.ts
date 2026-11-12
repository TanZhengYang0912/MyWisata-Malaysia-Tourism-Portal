// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 3/4: report-a-chat validation.

import { z } from 'zod';

export const REPORT_TEXT_MAX_LENGTH = 500;

export const reportChatSchema = z.object({
  chatType: z.enum(['user_vendor', 'user_admin', 'vendor_admin']),
  threadId: z.string().uuid(),
  reason: z.string().trim().max(REPORT_TEXT_MAX_LENGTH).optional(),
}).strict();

export type ReportChatInput = z.infer<typeof reportChatSchema>;

export const chatThreadReportSchema = z.object({
  reason: z.enum(['scam', 'abuse', 'spam', 'other']),
  details: z.string().trim().max(REPORT_TEXT_MAX_LENGTH).optional(),
}).strict();

export type ChatThreadReportInput = z.infer<typeof chatThreadReportSchema>;
