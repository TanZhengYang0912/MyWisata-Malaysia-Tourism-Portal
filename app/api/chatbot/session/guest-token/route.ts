import { NextResponse } from 'next/server';
import { isSameOriginMutation } from '@/lib/checkout/guest-session';
import { createClient } from '@/lib/supabase/server';
import { apiFail, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';
import { bindChatbotGuestSessionToken, hashChatbotGuestCredential, newChatbotGuestCredential, readChatbotGuestCredential, setChatbotGuestCookie } from '@/lib/chatbot/guest-session';
import { createServiceClient } from '@/lib/supabase/service';
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
  const user = authentication.state === 'authenticated' ? authentication.user : null;
  if (!user && !readChatbotGuestCredential(request)) {
    const credential = newChatbotGuestCredential();
    if (parsed.data.sessionKey) {
      const { data: session, error } = await createServiceClient().from('chatbot_sessions')
        .select('guest_token_hash, user_id, channel')
        .eq('session_key', parsed.data.sessionKey)
        .maybeSingle();
      if (error) return apiFail('READ_UNAVAILABLE', 'Unable to restore this conversation. Try again.', 503);
      if (session && (session.user_id !== null || session.channel !== 'customer')) {
        return apiFail('GUEST_SESSION_REQUIRED', 'This guest conversation cannot be restored in this browser. Start a new chat or sign in.', 409);
      }
      if (session?.guest_token_hash) return apiFail('GUEST_SESSION_REQUIRED', 'This guest conversation cannot be restored in this browser. Start a new chat or sign in.', 409);
      if (session) {
        const binding = await bindChatbotGuestSessionToken(parsed.data.sessionKey, hashChatbotGuestCredential(credential));
        if (binding === 'unavailable') return apiFail('READ_UNAVAILABLE', 'Unable to restore this conversation. Try again.', 503);
        if (binding !== 'bound') return apiFail('GUEST_SESSION_REQUIRED', 'This guest conversation cannot be restored in this browser. Start a new chat or sign in.', 409);
      }
    }
    const response = NextResponse.json({ data: { ready: true, guest: true }, error: null });
    setChatbotGuestCookie(response, credential);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  const response = NextResponse.json({ data: { ready: true, guest: !user }, error: null });
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
