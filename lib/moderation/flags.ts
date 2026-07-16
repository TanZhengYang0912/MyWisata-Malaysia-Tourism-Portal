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
  userId: string | null;
  userName: string;
  flagType: string;
  severity: 'low' | 'medium' | 'high';
  originalExcerpt: string | null;
  status: 'open' | 'reviewed';
  createdAt: string;
  reviewedAt: string | null;
}

function userDisplayName(row: { full_name: string | null; email: string } | undefined): string {
  return row?.full_name ?? row?.email ?? 'Unknown user';
}

export async function getModerationFlags(service: SupabaseClient): Promise<ModerationFlagRow[]> {
  const { data: flagsData } = await service
    .from('moderation_flags')
    .select('id, source_type, source_id, user_id, flag_type, severity, original_excerpt, status, created_at, reviewed_at')
    .order('created_at', { ascending: false });
  const flags = flagsData ?? [];

  const userIds = [...new Set(flags.map((f) => f.user_id).filter((id): id is string => Boolean(id)))];
  const { data: usersData } = userIds.length
    ? await service.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  return flags.map((f) => ({
    id: f.id,
    sourceType: f.source_type,
    sourceId: f.source_id,
    userId: f.user_id,
    userName: f.user_id ? userDisplayName(usersById.get(f.user_id)) : 'Unknown user',
    flagType: f.flag_type,
    severity: f.severity,
    originalExcerpt: f.original_excerpt,
    status: f.status,
    createdAt: f.created_at,
    reviewedAt: f.reviewed_at,
  }));
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
