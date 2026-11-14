// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4: "Reported Chat" storage —
// human-submitted reports of a user<->vendor, user<->admin, or vendor<->admin
// chat. Separate from lib/moderation/admin-conduct.ts (admin_conduct_flags is
// system-detected profanity; this is a person clicking Report) — see the
// migration comment for why they're separate tables.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatConductType = 'user_vendor' | 'user_admin' | 'vendor_admin';

export interface CreateChatConductReportInput {
  reporterId: string;
  partyAId: string;
  partyBId: string | null;
  chatType: ChatConductType;
  threadRef: string;
  reason: string | null;
}

export type CreateChatConductReportResult = { ok: true; id: string } | { ok: false; reason: 'duplicate' | 'error'; errorCode?: string };

/** Inserts a chat report. Returns a discriminated result instead of throwing — the caller (the report route) always needs to tell a real error apart from "you already reported this." */
export async function createChatConductReport(service: SupabaseClient, input: CreateChatConductReportInput): Promise<CreateChatConductReportResult> {
  const { data, error } = await service
    .from('chat_conduct_reports')
    .insert({
      reporter_id: input.reporterId,
      party_a_id: input.partyAId,
      party_b_id: input.partyBId,
      chat_type: input.chatType,
      thread_ref: input.threadRef,
      reason: input.reason?.slice(0, 500) ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'duplicate' };
    return { ok: false, reason: 'error', errorCode: error.code ?? 'unknown' };
  }
  return { ok: true, id: data.id };
}

export async function reviewChatConductReport(service: SupabaseClient, id: string, reviewerId: string): Promise<'reviewed' | 'already_reviewed' | 'not_found'> {
  const { data, error } = await service
    .from('chat_conduct_reports')
    .update({ status: 'reviewed', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (data) return 'reviewed';

  const { data: existing, error: readError } = await service
    .from('chat_conduct_reports')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  return existing?.status === 'reviewed' ? 'already_reviewed' : 'not_found';
}
