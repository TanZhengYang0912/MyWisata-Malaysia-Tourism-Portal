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

export type CreateChatConductReportResult = { ok: true; id: string } | { ok: false; reason: 'duplicate' | 'error'; message?: string };

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
    return { ok: false, reason: 'error', message: error.message };
  }
  return { ok: true, id: data.id };
}

export interface ChatConductReportRow {
  id: string;
  reporterId: string;
  reporterName: string;
  partyAId: string;
  partyAName: string;
  partyBId: string | null;
  partyBName: string | null;
  chatType: ChatConductType;
  threadRef: string;
  reason: string | null;
  status: 'open' | 'reviewed';
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

function userDisplayName(row: { full_name: string | null; email: string } | undefined): string {
  return row?.full_name ?? row?.email ?? 'Unknown user';
}

export async function getChatConductReports(service: SupabaseClient): Promise<ChatConductReportRow[]> {
  const { data: reportsData } = await service
    .from('chat_conduct_reports')
    .select('id, reporter_id, party_a_id, party_b_id, chat_type, thread_ref, reason, status, created_at, reviewed_at, reviewed_by')
    .order('created_at', { ascending: false });
  const reports = reportsData ?? [];

  const userIds = [...new Set(reports.flatMap((r) => [r.reporter_id, r.party_a_id, r.party_b_id]).filter((id): id is string => Boolean(id)))];
  const { data: usersData } = userIds.length
    ? await service.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  return reports.map((r) => ({
    id: r.id,
    reporterId: r.reporter_id,
    reporterName: userDisplayName(usersById.get(r.reporter_id)),
    partyAId: r.party_a_id,
    partyAName: userDisplayName(usersById.get(r.party_a_id)),
    partyBId: r.party_b_id,
    partyBName: r.party_b_id ? userDisplayName(usersById.get(r.party_b_id)) : null,
    chatType: r.chat_type,
    threadRef: r.thread_ref,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by,
  }));
}

export async function reviewChatConductReport(service: SupabaseClient, id: string, reviewerId: string): Promise<boolean> {
  const { data, error } = await service
    .from('chat_conduct_reports')
    .update({ status: 'reviewed', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
