import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { queryCustomerSupportStatus } from '@/lib/chatbot/customer-tools';

const schema = z.object({ kind: z.enum(['orders', 'bookings', 'refunds', 'tickets']) }).strict();

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in to check your account status.', 401);

  try {
    const result = await queryCustomerSupportStatus(db, user.id, parsed.data.kind);
    const response = apiOk(result);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return apiFail('READ_UNAVAILABLE', 'Unable to check your account status right now.', 503);
  }
}
