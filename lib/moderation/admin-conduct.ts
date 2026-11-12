// P4 — Member 4: staff conduct flag storage. CLAUDE-ADMIN-CONDUCT.md.
// Separate from lib/moderation/flags.ts (moderation_flags is the customer-
// safety table, slur-only, admin/approver-readable) — this is
// admin_conduct_flags (super-admin-only, catches profanity too, tracks who
// the admin was talking to). Same detector (lib/moderation/clean.ts) feeds
// both; this module just stores a different, richer record for the case
// where the AUTHOR was an admin.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CleanedContent } from './clean';

export type AdminConductSource = 'ticket_reply' | 'admin_ai';

export interface LogAdminConductFlagInput {
  cleaned: CleanedContent;
  flaggedAdminId: string;
  targetUserId: string | null;
  source: AdminConductSource;
  sourceRefId: string;
}

/**
 * Inserts a conduct flag when the cleaned content had profanity or a slur.
 * No-op (not an error) when neither was found. Never throws — a failed
 * flag write must not block the admin's actual reply/message, same
 * contract as logModerationFlag.
 */
export async function logAdminConductFlagIfNeeded(service: SupabaseClient, input: LogAdminConductFlagInput): Promise<void> {
  const { cleaned, flaggedAdminId, targetUserId, source, sourceRefId } = input;
  if (!cleaned.hadProfanity && !cleaned.hadSlur) return;

  const { error } = await service.from('admin_conduct_flags').insert({
    flagged_admin_id: flaggedAdminId,
    target_user_id: targetUserId,
    source,
    source_ref_id: sourceRefId,
    original_text: cleaned.original.slice(0, 500),
    severity: cleaned.hadSlur ? 'high' : 'medium',
  });
  if (error) console.error('[admin-conduct] failed to log flag', source, error.message);
}

export type ConductReviewResult = 'reviewed' | 'already_reviewed' | 'not_found';

export async function reviewAdminConductFlag(service: SupabaseClient, id: string, reviewerId: string): Promise<ConductReviewResult> {
  const { data, error } = await service
    .from('admin_conduct_flags')
    .update({ status: 'reviewed', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (data) return 'reviewed';

  const { data: existing, error: readError } = await service
    .from('admin_conduct_flags')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  return existing?.status === 'reviewed' ? 'already_reviewed' : 'not_found';
}
