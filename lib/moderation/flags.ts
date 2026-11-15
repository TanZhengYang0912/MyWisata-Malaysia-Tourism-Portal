// P4 — Member 4: moderation flag storage. CLAUDE-MODERATION.md Part 1.
// Same shape as lib/affiliate/fraud.ts's logFraudFlag/getFraudFlags — kept
// separate (not merged into that file) since this isn't affiliate-specific:
// it spans the chatbot and support tickets, not affiliate links/clicks.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ModerationSourceType = 'chatbot_message' | 'ticket' | 'ticket_reply';

export interface LogModerationFlagInput {
  sourceType: ModerationSourceType;
  sourceId: string;
  userId: string | null;
  /** The PII-redacted-but-profanity-visible text (lib/moderation/clean.ts's `original`) — never raw PII. */
  originalExcerpt: string;
}

/** Never throws — a failed flag write must not block the message/reply/ticket it's describing. */
export async function logModerationFlag(service: SupabaseClient, input: LogModerationFlagInput): Promise<void> {
  const { error } = await service.from('moderation_flags').insert({
    source_type: input.sourceType,
    source_id: input.sourceId,
    user_id: input.userId,
    flag_type: 'slur',
    severity: 'high',
    original_excerpt: input.originalExcerpt.slice(0, 500),
  });
  if (error) console.error('[moderation] failed to log flag', input.sourceType, error.message);
}

export interface ModerationFlagRow {
  id: string;
  sourceType: ModerationSourceType;
  sourceId: string;
  /** support_tickets.id to deep-link into /admin/support?ticket= — null for chatbot_message (no ticket). */
  ticketId: string | null;
  userId: string | null;
  userName: string;
  flagType: string;
  severity: 'low' | 'medium' | 'high';
  originalExcerpt: string | null;
  status: 'open' | 'reviewed';
  createdAt: string;
  reviewedAt: string | null;
}

export interface ModerationFlagPage {
  groups?: Array<{ key: string; ticketId: string | null; latestFlag: ModerationFlagRow; distinctFlagCount: number; openFlagCount: number }>;
  flags?: ModerationFlagRow[];
  page: number;
  pageSize: number;
  totalGroups?: number;
  totalFlags?: number;
  openFlagCount: number;
}

export async function getModerationFlagPage(service: SupabaseClient, input: {
  page: number;
  pageSize: number;
  showReviewed: boolean;
  groupKey?: string;
}): Promise<ModerationFlagPage> {
  const { data, error } = await service.rpc('list_admin_moderation_flag_groups', {
    p_page: input.page,
    p_page_size: input.pageSize,
    p_show_reviewed: input.showReviewed,
    p_group_key: input.groupKey ?? null,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('moderation_flags_invalid_response');
  return data as ModerationFlagPage;
}

export async function reviewModerationFlag(service: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await service
    .from('moderation_flags')
    .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
