import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPPORT_REPLY_PAGE_SIZE = 30;

export interface SupportReplyCursor {
  createdAt: string;
  id: string;
}

interface StoredSupportReply {
  id: string;
  sender_id: string;
  sender_role: 'customer' | 'admin';
  body: string;
  attachment_url: string | null;
  created_at: string;
}

export async function loadSupportReplyPage(
  service: SupabaseClient,
  ticketId: string,
  viewerId: string,
  before?: SupportReplyCursor,
) {
  let query = service.from('support_ticket_replies')
    .select('id, sender_id, sender_role, body, attachment_url, created_at')
    .eq('ticket_id', ticketId);

  if (before) {
    query = query.or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(SUPPORT_REPLY_PAGE_SIZE + 1);

  if (error) return { replies: null, nextCursor: null, error };

  const rows = (data ?? []) as StoredSupportReply[];
  const hasEarlier = rows.length > SUPPORT_REPLY_PAGE_SIZE;
  const page = rows.slice(0, SUPPORT_REPLY_PAGE_SIZE).reverse();
  const oldest = page[0];
  return {
    replies: page.map((reply) => {
      const extension = reply.attachment_url?.split('.').pop()?.toLowerCase() ?? null;
      return {
        id: reply.id,
        is_mine: reply.sender_id === viewerId,
        sender_role: reply.sender_role,
        body: reply.body,
        created_at: reply.created_at,
        attachment_type: extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'webp'
          ? 'image' as const
          : extension === 'pdf' ? 'document' as const : null,
      };
    }),
    nextCursor: hasEarlier && oldest ? { createdAt: oldest.created_at, id: oldest.id } : null,
    error: null,
  };
}
