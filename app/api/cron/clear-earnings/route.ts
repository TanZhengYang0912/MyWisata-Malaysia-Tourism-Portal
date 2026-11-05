import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { log } from '@/lib/log';
import { getRequestId } from '@/lib/request-id';

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
  const requestId = getRequestId(req);
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized', requestId }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('confirm_pending_earnings');

  if (error) {
    log('error', '[cron/clear-earnings] confirm_pending_earnings failed', { requestId, error: error.message });
    return NextResponse.json({ error: 'The scheduled earnings update could not be completed. Please retry later.', requestId }, { status: 500 });
  }

  log('info', '[cron/clear-earnings] confirmed', { requestId, confirmed: data });
  return NextResponse.json({ confirmed: data, requestId });
}
