import { NextResponse } from 'next/server';
import { isTngMockPayoutEnabled } from '@/lib/payouts/tng-config';
import {
  processTngMockCallbacks,
  reconcileTngMockCallbacks,
} from '@/lib/payouts/tng-mock-callbacks';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isTngMockPayoutEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const reconciled = await reconcileTngMockCallbacks();
    const processed = await processTngMockCallbacks({ limit: 20 });
    return NextResponse.json({
      reconciled: reconciled.count,
      inserted: reconciled.inserted,
      released: reconciled.released,
      ...processed,
    });
  } catch {
    console.error('[cron/tng-mock-callbacks] processing failed:', 'callback_processing_unavailable');
    return NextResponse.json({ error: 'callback_processing_unavailable' }, { status: 500 });
  }
}
