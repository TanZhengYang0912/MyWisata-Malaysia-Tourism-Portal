// P4 — Member 4: support ticket notifications. CLAUDE-FIXES.md Fix 2.
//
// Writes directly to `notifications` via the service-role client — NOT
// through the existing send_notification()/record_audit_and_notify() RPCs
// (migration 004). Those are SECURITY DEFINER functions gated on
// `auth.uid()` being the recipient or an admin; called from a service-role
// context (no session) `auth.uid()` is NULL, so they'd just raise "Not
// authenticated". Every write in this module already goes through
// service-role after its own server-side permission check (same pattern as
// affiliate_fraud_flags, audit_logs, etc.) — this is that same pattern, not
// a new one.

import type { SupabaseClient } from '@supabase/supabase-js';

const REPLY_PREVIEW_LENGTH = 200;

interface TicketForNotify {
  id: string;
  subject: string;
  user_id: string | null;
  assigned_to: string | null;
}

/** All users holding an admin-capable role (super_admin or approver) — same definition as the is_admin() SQL function. */
async function getAdminUserIds(service: SupabaseClient): Promise<string[]> {
  const { data: roles } = await service.from('roles').select('id').in('name', ['super_admin', 'approver']);
  const roleIds = (roles ?? []).map((r) => r.id);
  if (!roleIds.length) return [];

  const { data: userRoles } = await service.from('user_roles').select('user_id').in('role_id', roleIds);
  return [...new Set((userRoles ?? []).map((r) => r.user_id))];
}

/**
 * Notifies the other side of a ticket reply — the customer if an admin
 * replied, or the assigned admin (else every admin) if the customer
 * replied. Best-effort: failures are logged, never thrown — a reply that
 * saved successfully shouldn't fail the request just because the
 * notification insert did.
 */
export async function notifyTicketReply(
  service: SupabaseClient,
  ticket: TicketForNotify,
  senderRole: 'customer' | 'admin',
  replyBody: string,
): Promise<void> {
  try {
    const preview = replyBody.slice(0, REPLY_PREVIEW_LENGTH);

    if (senderRole === 'admin') {
      if (!ticket.user_id) return; // guest ticket — no account to notify
      await service.from('notifications').insert({
        user_id: ticket.user_id,
        type: 'support_reply',
        title: 'Support replied to your ticket',
        body: preview,
        link: `/customer/support/${ticket.id}`,
      });
      return;
    }

    const recipients = ticket.assigned_to ? [ticket.assigned_to] : await getAdminUserIds(service);
    if (recipients.length === 0) return;
    await service.from('notifications').insert(
      recipients.map((userId) => ({
        user_id: userId,
        type: 'support_reply',
        title: `New reply on ticket: ${ticket.subject}`,
        body: preview,
        link: `/admin/support?ticket=${ticket.id}`,
      })),
    );
  } catch (error) {
    console.error('[support] failed to send reply notification', error instanceof Error ? error.message : error);
  }
}

/** Notifies the customer when their ticket is marked resolved. No-op for guest tickets. */
export async function notifyTicketResolved(service: SupabaseClient, ticket: TicketForNotify): Promise<void> {
  try {
    if (!ticket.user_id) return;
    await service.from('notifications').insert({
      user_id: ticket.user_id,
      type: 'support_ticket_resolved',
      title: 'Your support ticket was resolved',
      body: ticket.subject,
      link: `/customer/support/${ticket.id}`,
    });
  } catch (error) {
    console.error('[support] failed to send resolved notification', error instanceof Error ? error.message : error);
  }
}

/** Notifies the assigned admin (else every admin) when a customer reopens a resolved ticket. CLAUDE-FIXES-2.md item 5. */
export async function notifyTicketReopened(service: SupabaseClient, ticket: TicketForNotify): Promise<void> {
  try {
    const recipients = ticket.assigned_to ? [ticket.assigned_to] : await getAdminUserIds(service);
    if (recipients.length === 0) return;
    await service.from('notifications').insert(
      recipients.map((userId) => ({
        user_id: userId,
        type: 'support_ticket_reopened',
        title: `Ticket reopened: ${ticket.subject}`,
        body: 'The customer reopened this ticket.',
        link: `/admin/support?ticket=${ticket.id}`,
      })),
    );
  } catch (error) {
    console.error('[support] failed to send reopened notification', error instanceof Error ? error.message : error);
  }
}
