// Vendor-Fair Event Participation — vendor-side announcement inbox.
// See Docs/plans/2026-09-28-1732-vendor-fair-event-participation.md.
// Read state is per-user (not per-vendor) — a user managing multiple
// vendors has one inbox, matching the TARUMT-style per-student read state
// this was modelled on.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface VendorAnnouncement {
  id: string;
  title: string;
  body: string;
  senderCode: string;
  campaignId: string | null;
  createdAt: string;
  isRead: boolean;
}

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  sender_code: string;
  campaign_id: string | null;
  created_at: string;
};

export async function getMyAnnouncements(db: SupabaseClient, userId: string): Promise<VendorAnnouncement[]> {
  const [{ data: announcements, error: announcementsError }, { data: reads, error: readsError }] = await Promise.all([
    db.from('vendor_announcements').select('id,title,body,sender_code,campaign_id,created_at').order('created_at', { ascending: false }),
    db.from('vendor_announcement_reads').select('announcement_id').eq('user_id', userId),
  ]);
  if (announcementsError) throw new Error(`Failed to load announcements: ${announcementsError.message}`);
  if (readsError) throw new Error(`Failed to load read state: ${readsError.message}`);

  const readIds = new Set((reads ?? []).map((row) => row.announcement_id as string));
  return ((announcements ?? []) as AnnouncementRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    senderCode: row.sender_code,
    campaignId: row.campaign_id,
    createdAt: row.created_at,
    isRead: readIds.has(row.id),
  }));
}

export async function markAnnouncementRead(
  authDb: SupabaseClient,
  announcementId: string,
): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'unknown' }> {
  const { error } = await authDb.rpc('mark_vendor_announcement_read', { p_announcement_id: announcementId });
  if (!error) return { ok: true };
  if (error.message.includes('not_found')) return { ok: false, code: 'not_found' };
  return { ok: false, code: 'unknown' };
}

export async function markAnnouncementsRead(
  authDb: SupabaseClient,
  announcementIds: string[],
): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'invalid_batch' | 'unknown' }> {
  const { error } = await authDb.rpc('mark_vendor_announcements_read', { p_announcement_ids: announcementIds });
  if (!error) return { ok: true };
  if (error.message.includes('not_found')) return { ok: false, code: 'not_found' };
  if (error.message.includes('invalid_batch')) return { ok: false, code: 'invalid_batch' };
  return { ok: false, code: 'unknown' };
}

export async function markAnnouncementsUnread(
  authDb: SupabaseClient,
  announcementIds: string[],
): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'invalid_batch' | 'unknown' }> {
  const { error } = await authDb.rpc('mark_vendor_announcements_unread', { p_announcement_ids: announcementIds });
  if (!error) return { ok: true };
  if (error.message.includes('not_found')) return { ok: false, code: 'not_found' };
  if (error.message.includes('invalid_batch')) return { ok: false, code: 'invalid_batch' };
  return { ok: false, code: 'unknown' };
}
