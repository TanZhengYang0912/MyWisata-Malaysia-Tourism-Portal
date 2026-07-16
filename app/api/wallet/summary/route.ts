import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await db
    .from('wallets')
    .select('topup_sen,earnings_sen,pending_earnings_sen,reserved_earnings_sen,withdrawn_earnings_sen')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load wallet balance' }, { status: 500 });

  return NextResponse.json({
    data: {
      topupSen: data?.topup_sen ?? 0,
      earningsSen: data?.earnings_sen ?? 0,
      pendingEarningsSen: data?.pending_earnings_sen ?? 0,
      reservedEarningsSen: data?.reserved_earnings_sen ?? 0,
      withdrawnEarningsSen: data?.withdrawn_earnings_sen ?? 0,
    },
    error: null,
  });
}
