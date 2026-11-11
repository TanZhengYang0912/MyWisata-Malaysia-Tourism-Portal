// A reply, ticket activity/status update, and notification are committed by
// one database transaction so a lost HTTP response can be retried safely.
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { createTicketReplySchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { cleanUserContent } from '@/lib/moderation/clean';
import { logModerationFlag } from '@/lib/moderation/flags';
import { logAdminConductFlagIfNeeded } from '@/lib/moderation/admin-conduct';
import { createHash } from 'node:crypto';

interface Props {
  params: Promise<{ id: string }>;
}

interface CommittedReply {
  id: string;
  sender_id: string;
  sender_role: 'customer' | 'admin';
  body: string;
  created_at: string;
  new_status: string;
  created: boolean;
  ticket_user_id: string | null;
}

function parseCommittedReply(value: unknown): CommittedReply | null {
  if (typeof value !== 'object' || value === null) return null;
  const reply = value as Record<string, unknown>;
  if (
    typeof reply.id !== 'string'
    || typeof reply.sender_id !== 'string'
    || (reply.sender_role !== 'customer' && reply.sender_role !== 'admin')
    || typeof reply.body !== 'string'
    || typeof reply.created_at !== 'string'
    || typeof reply.new_status !== 'string'
    || typeof reply.created !== 'boolean'
    || (reply.ticket_user_id !== null && typeof reply.ticket_user_id !== 'string')
  ) return null;

  return reply as unknown as CommittedReply;
}

const PUBLIC_TRANSACTION_ERRORS: Record<string, { code: string; message: string; status: number }> = {
  support_ticket_not_found: { code: 'NOT_FOUND', message: 'Ticket not found.', status: 404 },
  support_ticket_forbidden: { code: 'FORBIDDEN', message: 'You cannot reply to this ticket.', status: 403 },
  support_ticket_locked: { code: 'TICKET_LOCKED', message: 'This ticket is resolved. Reopen it to reply.', status: 403 },
  support_ticket_operation_conflict: { code: 'OPERATION_CONFLICT', message: 'This reply was already sent with different text.', status: 409 },
  support_ticket_invalid_reply: { code: 'VALIDATION_FAILED', message: 'Enter a valid reply and try again.', status: 422 },
};

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, createTicketReplySchema);
  if (!parsed.ok) return parsed.response;
  const { body, operationId } = parsed.data;
  if (!operationId) return apiFail('UPDATE_REQUIRED', 'Refresh the ticket page before sending a reply.', 409);

  const isAdmin = await isSuperAdmin(supabase, user.id);
  const senderRole: 'customer' | 'admin' = isAdmin ? 'admin' : 'customer';
  const service = createServiceClient();
  const cleaned = await cleanUserContent(body, service);
  const operationPayloadHash = createHash('sha256').update(JSON.stringify({
    ticketId: id,
    senderId: user.id,
    senderRole,
    body: cleaned.display,
  })).digest('hex');

  const { data, error } = await service.rpc('commit_support_ticket_reply', {
    p_ticket_id: id,
    p_actor_id: user.id,
    p_sender_role: senderRole,
    p_body: cleaned.display,
    p_operation_id: operationId,
    p_operation_payload_hash: operationPayloadHash,
  });

  if (error) {
    const transactionError = PUBLIC_TRANSACTION_ERRORS[error.message];
    if (transactionError) return apiFail(transactionError.code, transactionError.message, transactionError.status);
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm your reply. Check this ticket before trying again.', 503);
  }

  const reply = parseCommittedReply(data);
  if (!reply) return apiFail('WRITE_UNAVAILABLE', 'We could not confirm your reply. Check this ticket before trying again.', 503);

  // These moderation records are intentionally outside the transaction: they
  // are best-effort review signals, not part of the customer's reply result.
  if (reply.created && cleaned.hadSlur) {
    await logModerationFlag(service, {
      sourceType: 'ticket_reply',
      sourceId: reply.id,
      userId: user.id,
      originalExcerpt: cleaned.original,
    });
  }

  if (reply.created && senderRole === 'admin') {
    await logAdminConductFlagIfNeeded(service, {
      cleaned,
      flaggedAdminId: user.id,
      targetUserId: reply.ticket_user_id,
      source: 'ticket_reply',
      sourceRefId: id,
    });
  }

  return apiOk(
    {
      id: reply.id,
      senderId: reply.sender_id,
      senderRole: reply.sender_role,
      body: reply.body,
      createdAt: reply.created_at,
      newStatus: reply.new_status,
    },
    { status: reply.created ? 201 : 200 },
  );
}
