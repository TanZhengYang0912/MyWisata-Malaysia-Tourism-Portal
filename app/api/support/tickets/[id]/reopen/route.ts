import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail, parseBody } from '@/lib/validation/schemas';

interface Props {
  params: Promise<{ id: string }>;
}

const uuidSchema = z.string().uuid();
const reopenRequestSchema = z.object({ operationId: z.string().uuid() });
const TICKET_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

const PUBLIC_REOPEN_ERRORS: Record<string, { code: string; message: string; status: number }> = {
  support_ticket_not_found: { code: 'NOT_FOUND', message: 'Ticket not found.', status: 404 },
  support_ticket_forbidden: { code: 'FORBIDDEN', message: 'You cannot reopen this ticket.', status: 403 },
  support_ticket_invalid_reopen: { code: 'INVALID_INPUT', message: 'This ticket could not be reopened.', status: 422 },
  support_operation_conflict: { code: 'OPERATION_CONFLICT', message: 'This reopen request conflicts with an earlier request.', status: 409 },
};

function errorResponse(message: string) {
  const knownError = PUBLIC_REOPEN_ERRORS[message];
  if (knownError) return apiFail(knownError.code, knownError.message, knownError.status);
  if (message === 'support_operation_lease_lost' || message === 'support_operation_forbidden') {
    return apiFail('OPERATION_UNKNOWN', 'We could not confirm the ticket status. Check the ticket before trying again.', 409);
  }
  return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
}

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiFail('INVALID_INPUT', 'Choose a valid support ticket.', 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, reopenRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { operationId } = parsed.data;
  const operationPayloadHash = createHash('sha256').update(JSON.stringify({
    ticketId: id,
    actorId: user.id,
    action: 'reopen',
  })).digest('hex');
  const service = createServiceClient();

  const { data: reservationData, error: reservationError } = await service.rpc('reserve_support_operation', {
    p_operation_id: operationId,
    p_actor_key: `user:${user.id}`,
    p_owner_user_id: user.id,
    p_session_id: null,
    p_kind: 'reopen',
    p_payload_hash: operationPayloadHash,
    p_lease_seconds: 120,
  });
  if (reservationError) return errorResponse(reservationError.message);
  if (typeof reservationData !== 'object' || reservationData === null) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
  }

  const reservation = reservationData as Record<string, unknown>;
  if (reservation.state === 'running' && reservation.shouldExecute !== true) {
    return apiFail('OPERATION_UNKNOWN', 'We could not confirm the ticket status. Check the ticket before trying again.', 409);
  }
  if (reservation.state !== 'running' && reservation.state !== 'completed') {
    return apiFail('OPERATION_UNKNOWN', 'We could not confirm the ticket status. Check the ticket before trying again.', 409);
  }
  const leaseToken = reservation.state === 'completed' ? null : reservation.leaseToken;
  if (reservation.state === 'running' && (typeof leaseToken !== 'string' || !uuidSchema.safeParse(leaseToken).success)) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
  }

  const { data, error } = await service.rpc('reopen_support_ticket', {
    p_operation_id: operationId,
    p_ticket_id: id,
    p_actor_id: user.id,
    p_operation_payload_hash: operationPayloadHash,
    p_lease_token: leaseToken,
  });
  if (error) return errorResponse(error.message);

  if (typeof data !== 'object' || data === null) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
  }
  const result = data as Record<string, unknown>;
  if (result.id !== id || typeof result.status !== 'string' || !TICKET_STATUSES.has(result.status)
      || typeof result.changed !== 'boolean') {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
  }

  return apiOk({ id, status: result.status, changed: result.changed, replayed: result.replayed === true });
}
