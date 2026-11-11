import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { hashChatbotGuestCredential, readChatbotGuestCredential } from '@/lib/chatbot/guest-session';

interface Props {
  params: Promise<{ operationId: string }>;
}

const operationIdSchema = z.string().uuid();

export async function GET(request: Request, { params }: Props) {
  const { operationId } = await params;
  if (!operationIdSchema.safeParse(operationId).success) return apiFail('BAD_REQUEST', 'Invalid operation reference.', 400);
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  const service = createServiceClient();
  const guestCredential = user ? null : readChatbotGuestCredential(request);
  if (user) {
    const { data: ticket, error: ticketError } = await service
      .from('support_tickets')
      .select('id,category')
      .eq('operation_id', operationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ticketError) return apiFail('READ_UNAVAILABLE', 'Unable to check the ticket result.', 503);
    if (ticket) {
      const response = apiOk({ state: 'completed', ticketId: ticket.id, category: ticket.category });
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }
  if (user || guestCredential) {
    const { data: operation, error: operationError } = await service
      .from('support_operations')
      .select('id, actor_key, owner_user_id, session_id, state, result_id, error_code, updated_at, lease_expires_at, external_started_at')
      .eq('id', operationId)
      .eq('kind', 'ask')
      .maybeSingle();
    if (operationError) return apiFail('READ_UNAVAILABLE', 'Unable to check this request.', 503);
    if (operation) {
      const guestCredentialHash = guestCredential ? hashChatbotGuestCredential(guestCredential) : null;
      let ownsOperation = user
        ? operation.owner_user_id === user.id || operation.actor_key === `user:${user.id}`
        : operation.actor_key === `guest:${guestCredentialHash}`;
      if (ownsOperation && !user && guestCredentialHash && operation.session_id) {
        const { data: guestSession, error: sessionError } = await service
          .from('chatbot_sessions')
          .select('id')
          .eq('id', operation.session_id)
          .is('user_id', null)
          .eq('guest_token_hash', guestCredentialHash)
          .maybeSingle();
        if (sessionError) return apiFail('READ_UNAVAILABLE', 'Unable to check this request.', 503);
        ownsOperation = Boolean(guestSession);
      }
      if (!ownsOperation && user && operation.session_id) {
        const { data: ownedSession, error: sessionError } = await service
          .from('chatbot_sessions')
          .select('id')
          .eq('id', operation.session_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (sessionError) return apiFail('READ_UNAVAILABLE', 'Unable to check this request.', 503);
        ownsOperation = Boolean(ownedSession);
      }
      if (!ownsOperation) return apiFail('NOT_FOUND', 'This request was not found.', 404);
      const leaseExpired = operation.lease_expires_at
        ? new Date(operation.lease_expires_at).getTime() <= Date.now()
        : false;
      const state = operation.state === 'running' && leaseExpired && operation.external_started_at
        ? 'unknown'
        : operation.state;
      const response = apiOk({
        id: operation.id,
        kind: 'ask',
        state,
        resultId: operation.result_id,
        errorCode: operation.error_code,
        updatedAt: operation.updated_at,
      });
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }

  if (!user) return apiFail('UNAUTHORIZED', 'Sign in to check this ticket result.', 401);
  const response = apiOk({ state: 'not_found' });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
