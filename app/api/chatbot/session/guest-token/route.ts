import { isSameOriginMutation } from '@/lib/checkout/guest-session';
import { createClient } from '@/lib/supabase/server';
import { apiFail, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth/request-user';

const requestSchema = z.object({ sessionKey: z.string().min(1).max(64).optional() }).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return apiFail('FORBIDDEN', 'This request could not be verified.', 403);
  const parsed = await parseBody(request, requestSchema);
  if (!parsed.ok) return parsed.response;
  let auth: Awaited<ReturnType<typeof createClient>>;
  try {
    auth = await createClient();
  } catch {
    return apiFail('AUTH_UNAVAILABLE', 'Unable to verify your sign-in right now. Check your connection and try again.', 503);
  }
  const authentication = await getAuthenticatedUser(auth);
  if (authentication.state === 'unavailable') {
    return apiFail('AUTH_UNAVAILABLE', 'Unable to verify your sign-in right now. Check your connection and try again.', 503);
  }
  if (authentication.state !== 'authenticated') return apiFail('UNAUTHORIZED', 'Sign in to use MYLawatan Bot.', 401);
  const response = Response.json({ data: { ready: true, guest: false }, error: null });
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
