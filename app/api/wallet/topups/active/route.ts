import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveWalletTopUp } from '@/lib/wallet/topup-operations';

export const dynamic = 'force-dynamic';

export async function GET() {
  const response = (body: unknown, status = 200) => {
    const result = NextResponse.json(body, { status });
    result.headers.set('Cache-Control', 'private, no-store, max-age=0');
    result.headers.set('Referrer-Policy', 'no-referrer');
    return result;
  };
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user || user.is_anonymous) return response({ error: 'Sign in required' }, 401);
    return response({ operation: await getActiveWalletTopUp(user.id) });
  } catch {
    return response({ error: 'Unable to check top-up status yet' }, 503);
  }
}
