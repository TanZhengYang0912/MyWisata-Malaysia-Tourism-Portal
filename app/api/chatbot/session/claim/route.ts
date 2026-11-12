import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isSameOriginMutation } from '@/lib/checkout/guest-session';
import { apiFail, parseBody } from '@/lib/validation/schemas';
import { clearChatbotGuestCookie, hashChatbotGuestCredential, readChatbotGuestCredential } from '@/lib/chatbot/guest-session';
import { getAuthenticatedUser } from '@/lib/auth/request-user';

const claimSchema = z.object({ sessionKey: z.string().min(1).max(64) }).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return apiFail('FORBIDDEN', 'This request could not be verified.', 403);
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
  if (authentication.state !== 'authenticated') return apiFail('UNAUTHORIZED', 'Sign in to continue this conversation.', 401);
  const user = authentication.user;
  const guestCredential = readChatbotGuestCredential(request);
  const parsed = await parseBody(request, claimSchema);
  if (!parsed.ok) return parsed.response;

  if (!guestCredential) {
    try {
      const { data, error } = await createServiceClient().rpc('claim_chatbot_guest_session', {
        p_session_key: parsed.data.sessionKey,
        p_user_id: user.id,
        p_guest_token_hash: null,
      });
      if (!error && typeof data === 'object' && data !== null && data.session_key === parsed.data.sessionKey && data.already_owned === true) {
        const response = NextResponse.json({ data: { sessionKey: parsed.data.sessionKey, alreadyOwned: true }, error: null });
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    } catch {
      // Keep the same public recovery response for unconfirmed claims.
    }
    return apiFail('GUEST_SESSION_REQUIRED', 'This guest conversation is no longer available. Start a new chat.', 401);
  }

  try {
    const { data, error } = await createServiceClient().rpc('claim_chatbot_guest_session', {
      p_session_key: parsed.data.sessionKey,
      p_user_id: user.id,
      p_guest_token_hash: hashChatbotGuestCredential(guestCredential),
    });
    if (error) {
      const knownErrors: Record<string, { code: string; message: string; status: number }> = {
        chatbot_guest_session_not_found: { code: 'NOT_FOUND', message: 'This guest conversation is no longer available.', status: 404 },
        chatbot_guest_session_conflict: { code: 'OPERATION_CONFLICT', message: 'This conversation is already linked to another account.', status: 409 },
      };
      const knownError = knownErrors[error.message];
      return knownError
        ? apiFail(knownError.code, knownError.message, knownError.status)
        : apiFail('WRITE_UNAVAILABLE', 'We could not link this conversation. Try again.', 503);
    }
    if (typeof data !== 'object' || data === null || data.session_key !== parsed.data.sessionKey || typeof data.already_owned !== 'boolean') {
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm this conversation link. Check the chat before trying again.', 503);
    }
    const response = NextResponse.json({ data: { sessionKey: parsed.data.sessionKey, alreadyOwned: data.already_owned }, error: null });
    response.headers.set('Cache-Control', 'private, no-store');
    clearChatbotGuestCookie(response);
    return response;
  } catch {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm this conversation link. Check the chat before trying again.', 503);
  }
}
