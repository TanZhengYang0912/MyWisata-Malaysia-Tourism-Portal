import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ user: null, wallet: null });

  const { data: wallet } = await db
    .from('wallets')
    .select('topup_sen,earnings_sen')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ user: { id: user.id, email: user.email }, wallet });
}
