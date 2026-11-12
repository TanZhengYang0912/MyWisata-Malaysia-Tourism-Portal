import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { queryCustomerSupportStatus } from '@/lib/chatbot/customer-tools';
import { getAuthenticatedUser } from '@/lib/auth/request-user';

const schema = z.object({ kind: z.enum(['orders', 'bookings', 'refunds', 'tickets']) }).strict();

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  try {
    const db = await createClient();
    const authentication = await getAuthenticatedUser(db);
    if (authentication.state === 'unauthenticated') {
      return apiFail('UNAUTHORIZED', 'Sign in to check your account status.', 401);
    }
    if (authentication.state === 'unavailable') {
      return apiFail('AUTH_UNAVAILABLE', 'Unable to verify your sign-in right now. Check your connection and try again.', 503);
    }

    const result = await queryCustomerSupportStatus(db, authentication.user.id, parsed.data.kind);
    const response = apiOk(result);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return apiFail('READ_UNAVAILABLE', 'Unable to check your account status right now.', 503);
  }
}
