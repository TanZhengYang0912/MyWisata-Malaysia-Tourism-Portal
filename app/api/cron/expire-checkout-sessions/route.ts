import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await createServiceClient().rpc('expire_checkout_sessions');
  if (error) return NextResponse.json({ error: 'checkout_expiration_failed' }, { status: 500 });
  return NextResponse.json({ expired: Number(data ?? 0) });
}
