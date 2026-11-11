import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';

interface Props {
  params: Promise<{ id: string }>;
}

const PUBLIC_REOPEN_ERRORS: Record<string, { code: string; message: string; status: number }> = {
  support_ticket_not_found: { code: 'NOT_FOUND', message: 'Ticket not found.', status: 404 },
  support_ticket_forbidden: { code: 'FORBIDDEN', message: 'You cannot reopen this ticket.', status: 403 },
  support_ticket_invalid_reopen: { code: 'INVALID_INPUT', message: 'This ticket could not be reopened.', status: 422 },
};

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await createServiceClient().rpc('reopen_support_ticket', {
    p_ticket_id: id,
    p_actor_id: user.id,
  });

  if (error) {
    const knownError = PUBLIC_REOPEN_ERRORS[error.message];
    if (knownError) return apiFail(knownError.code, knownError.message, knownError.status);
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
  }

  if (typeof data !== 'object' || data === null) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
  }
  const result = data as Record<string, unknown>;
  if (result.id !== id || typeof result.status !== 'string' || typeof result.changed !== 'boolean') {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the ticket status. Check the ticket before trying again.', 503);
  }

  return apiOk({ id, status: result.status, changed: result.changed });
}
