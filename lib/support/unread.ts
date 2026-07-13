// P4 — Member 4: unread ticket computation. CLAUDE-FIXES-2.md item 1.
//
// unread = a reply from the OTHER side newer than MY last-read timestamp —
// or I've never read it at all and at least one such reply exists.

import type { SupabaseClient } from '@supabase/supabase-js';

export function isUnread(lastReadAt: string | null, latestOtherSideReplyAt: string | undefined | null): boolean {
  if (!latestOtherSideReplyAt) return false;
  if (!lastReadAt) return true;
  return latestOtherSideReplyAt > lastReadAt;
}

/** For each ticket in `ticketIds`, the latest reply timestamp sent BY `fromRole` — keyed by ticket_id. Tickets with no such reply are simply absent from the map. */
export async function getLatestReplyTimestamps(
  service: SupabaseClient,
  ticketIds: string[],
  fromRole: 'admin' | 'customer',
): Promise<Map<string, string>> {
  if (!ticketIds.length) return new Map();
  const { data } = await service
    .from('support_ticket_replies')
    .select('ticket_id, created_at')
    .in('ticket_id', ticketIds)
    .eq('sender_role', fromRole)
    .order('created_at', { ascending: false });

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    // Rows arrive newest-first, per ticket — first one seen per ticket_id is its latest.
    if (!map.has(row.ticket_id)) map.set(row.ticket_id, row.created_at);
  }
  return map;
}

/**
 * For each ticket in `ticketIds`, the EARLIEST reply timestamp sent BY
 * `fromRole` — keyed by ticket_id. Used for "unanswered" (no admin reply at
 * all -> absent from the map when fromRole='admin') and average
 * first-response time (CLAUDE-FIXES-2.md item 3).
 */
export async function getEarliestReplyTimestamps(
  service: SupabaseClient,
  ticketIds: string[],
  fromRole: 'admin' | 'customer',
): Promise<Map<string, string>> {
  if (!ticketIds.length) return new Map();
  const { data } = await service
    .from('support_ticket_replies')
    .select('ticket_id, created_at')
    .in('ticket_id', ticketIds)
    .eq('sender_role', fromRole)
    .order('created_at', { ascending: true });

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    // Rows arrive oldest-first, per ticket — first one seen per ticket_id is its earliest.
    if (!map.has(row.ticket_id)) map.set(row.ticket_id, row.created_at);
  }
  return map;
}
