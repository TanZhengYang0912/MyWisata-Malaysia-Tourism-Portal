// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 3/4: report-a-chat validation.

import { z } from 'zod';

export const reportChatSchema = z.object({
  chatType: z.enum(['user_vendor', 'user_admin', 'vendor_admin']),
  threadId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
}).strict();

export type ReportChatInput = z.infer<typeof reportChatSchema>;
