import { NextResponse } from 'next/server';
import { isSameOriginMutation } from '@/lib/checkout/guest-session';
import { createClient } from '@/lib/supabase/server';
import { apiFail, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';
import { bindChatbotGuestSessionToken, hashChatbotGuestCredential, newChatbotGuestCredential, readChatbotGuestCredential, setChatbotGuestCookie } from '@/lib/chatbot/guest-session';
import { createServiceClient } from '@/lib/supabase/service';

const requestSchema = z.object({ sessionKey: z.string().min(1).max(64).optional() }).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return apiFail('FORBIDDEN', 'This request could not be verified.', 403);
  const parsed = await parseBody(request, requestSchema);
  if (!parsed.ok) return parsed.response;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  const response = NextResponse.json({ data: { ready: true, guest: !user }, error: null });
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
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
      if (session?.guest_token_hash) {
        return apiFail('GUEST_SESSION_REQUIRED', 'This guest conversation cannot be restored in this browser. Start a new chat or sign in.', 409);
      }
      if (session && !await bindChatbotGuestSessionToken(parsed.data.sessionKey, hashChatbotGuestCredential(credential))) {
        return apiFail('READ_UNAVAILABLE', 'Unable to restore this conversation. Try again.', 503);
      }
    }
    setChatbotGuestCookie(response, credential);
  }
  return response;
}
