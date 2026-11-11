import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

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
  if (!user) {
    return apiFail('UNAUTHORIZED', 'Sign in to check this ticket result.', 401);
  }

  let query = service.from('support_tickets').select('id,category').eq('operation_id', operationId);
  query = query.eq('user_id', user.id);
  const { data: ticket, error } = await query.maybeSingle();
  if (error) return apiFail('READ_UNAVAILABLE', 'Unable to check the ticket result.', 503);
  const response = apiOk(ticket
    ? { state: 'completed', ticketId: ticket.id, category: ticket.category }
    : { state: 'not_found' });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
