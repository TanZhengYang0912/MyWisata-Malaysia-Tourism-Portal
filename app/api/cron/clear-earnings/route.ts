import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * POST /api/cron/clear-earnings
 *
 * Called by Vercel Cron (daily at midnight MYT) or admin UI.
 * Vercel Cron calls with Authorization: Bearer <CRON_SECRET>.
 * Admin UI calls via /api/admin/clear-earnings (browser auth).
 *
 * Runs confirm_pending_earnings() — moves all past-due pending affiliate
 * commissions from pending_earnings_sen → earnings_sen.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('confirm_pending_earnings');

  if (error) {
    console.error('[cron/clear-earnings]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[cron/clear-earnings] confirmed=${data}`);
  return NextResponse.json({ confirmed: data });
}
