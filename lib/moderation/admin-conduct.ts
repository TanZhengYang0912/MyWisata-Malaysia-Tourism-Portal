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

export interface AdminConductFlagRow {
  id: string;
  flaggedAdminId: string;
  flaggedAdminName: string;
  targetUserId: string | null;
  targetUserName: string | null;
  source: AdminConductSource;
  sourceRefId: string;
  originalText: string;
  severity: 'medium' | 'high';
  status: 'open' | 'reviewed';
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

function userDisplayName(row: { full_name: string | null; email: string } | undefined): string {
  return row?.full_name ?? row?.email ?? 'Unknown user';
}

export async function getAdminConductFlags(service: SupabaseClient): Promise<AdminConductFlagRow[]> {
  const { data: flagsData } = await service
    .from('admin_conduct_flags')
    .select('id, flagged_admin_id, target_user_id, source, source_ref_id, original_text, severity, status, created_at, reviewed_at, reviewed_by')
    .order('created_at', { ascending: false });
  const flags = flagsData ?? [];

  const userIds = [...new Set(flags.flatMap((f) => [f.flagged_admin_id, f.target_user_id]).filter((id): id is string => Boolean(id)))];
  const { data: usersData } = userIds.length
    ? await service.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  return flags.map((f) => ({
    id: f.id,
    flaggedAdminId: f.flagged_admin_id,
    flaggedAdminName: userDisplayName(usersById.get(f.flagged_admin_id)),
    targetUserId: f.target_user_id,
    targetUserName: f.target_user_id ? userDisplayName(usersById.get(f.target_user_id)) : null,
    source: f.source,
    sourceRefId: f.source_ref_id,
    originalText: f.original_text,
    severity: f.severity,
    status: f.status,
    createdAt: f.created_at,
    reviewedAt: f.reviewed_at,
    reviewedBy: f.reviewed_by,
  }));
}

export async function reviewAdminConductFlag(service: SupabaseClient, id: string, reviewerId: string): Promise<boolean> {
  const { data, error } = await service
    .from('admin_conduct_flags')
    .update({ status: 'reviewed', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
