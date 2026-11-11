import 'server-only';
import type { NextResponse } from 'next/server';
import { hashGuestCredential, newGuestCredential } from '@/lib/checkout/guest-session';
import { createServiceClient } from '@/lib/supabase/service';

const COOKIE_NAME = 'mw-chatbot-guest';
const SECURE_COOKIE_NAME = '__Host-mw-chatbot-guest';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export { hashGuestCredential as hashChatbotGuestCredential, newGuestCredential as newChatbotGuestCredential };

function cookieName(): string {
  return process.env.NODE_ENV === 'production' ? SECURE_COOKIE_NAME : COOKIE_NAME;
}

export function readChatbotGuestCredential(request: Request): string | null {
  const name = cookieName();
  const raw = request.headers.get('cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
}

export function setChatbotGuestCookie(response: NextResponse, credential: string): void {
  const isSecure = process.env.NODE_ENV === 'production';
  response.cookies.set(cookieName(), credential, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearChatbotGuestCookie(response: NextResponse): void {
  response.cookies.set(cookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function bindChatbotGuestSessionToken(sessionKey: string, tokenHash: string): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().rpc('bind_chatbot_guest_session_token', {
      p_session_key: sessionKey,
      p_guest_token_hash: tokenHash,
    });
    return !error && typeof data === 'object' && data !== null && data.bound === true;
  } catch {
    return false;
  }
}
