// P4 — in-app notification-center entries for new chat messages.
//
// Coalesced: the event_key is per (thread, recipient), so a burst of messages
// keeps ONE unread notification that bumps to the top and re-marks unread each
// time — not one row per message. (notifications_event_key_unique makes
// .upsert(..., { onConflict: 'event_key' }) an insert-or-update.)
//
// Never throws — a notification failure must not fail the message send. Every
// message send path calls this best-effort after the row is persisted.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVendorRecipients } from '@/lib/vendor-notifications/scope';

interface NotifyOpts {
  threadId: string;
  senderId: string;
  senderRole: 'customer' | 'vendor';
  customerId: string;
  vendorId: string | null;
  outletId: string | null;
  /** Masked message body, or null for an attachment (localised copy is picked by metadata.attachment). */
  preview: string | null;
}

const PREVIEW_MAX = 140;

export async function notifyNewChatMessage(service: SupabaseClient, opts: NotifyOpts): Promise<void> {
  try {
    const preview = opts.preview ? opts.preview.slice(0, PREVIEW_MAX) : null;
    const base = {
      type: 'chat_message',
      read_at: null as string | null,
      created_at: new Date().toISOString(),
      metadata: { thread_id: opts.threadId, preview, attachment: preview === null },
    };

    if (opts.senderRole === 'customer') {
      if (!opts.vendorId) return;
      const [{ data: sender }, recipients] = await Promise.all([
        service.from('public_users').select('display_name,full_name').eq('id', opts.senderId).maybeSingle(),
        resolveVendorRecipients({ vendorId: opts.vendorId, outletId: opts.outletId, audience: 'owner_and_assigned_outlet', serviceDb: service }),
      ]);
      const name = sender?.display_name?.trim() || sender?.full_name?.trim() || 'A customer';
      const rows = recipients
        .filter((r) => r.userId !== opts.senderId)
        .map((r) => ({
          ...base,
          user_id: r.userId,
          vendor_id: opts.vendorId,
          outlet_id: r.outletId,
          audience_role: r.role,
          category: 'vendor_orders',
          title: `New message from ${name}`,
          body: preview ?? 'Sent an attachment',
          link: `/vendor/inbox?thread=${opts.threadId}`,
          metadata: { ...base.metadata, name },
          event_key: `chat:${opts.threadId}:${r.userId}`,
        }));
      if (rows.length === 0) return;
      await service.from('notifications').upsert(rows, { onConflict: 'event_key' });
      return;
    }

    // vendor -> customer
    if (opts.customerId === opts.senderId) return;
    const { data: outlet } = opts.outletId
      ? await service.from('outlets').select('name').eq('id', opts.outletId).maybeSingle()
      : { data: null };
    const name = outlet?.name?.trim() || 'The vendor';
    await service.from('notifications').upsert(
      {
        ...base,
        user_id: opts.customerId,
        category: 'messages',
        title: `New message from ${name}`,
        body: preview ?? 'Sent an attachment',
        link: `/customer?chat=${opts.threadId}`,
        metadata: { ...base.metadata, name },
        event_key: `chat:${opts.threadId}:${opts.customerId}`,
      },
      { onConflict: 'event_key' },
    );
  } catch (error) {
    console.error('[chat/notify] failed', opts.threadId, error instanceof Error ? error.message : error);
  }
}
