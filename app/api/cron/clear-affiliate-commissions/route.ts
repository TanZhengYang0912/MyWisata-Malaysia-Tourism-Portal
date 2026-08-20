import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { clearMaturedCommissions } from '@/lib/affiliate/clearing';

/**
 * POST /api/cron/clear-affiliate-commissions
 *
 * CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 2: runs
 * clearMaturedCommissions() (lib/affiliate/clearing.ts) on a schedule so the
 * pending -> available lifecycle doesn't depend on someone pressing the
 * admin "Run clearing" button (app/api/admin/affiliate/run-clearing) to be
 * real. Same CRON_SECRET bearer-auth pattern as every other /api/cron/*
 * route in this repo (archive-chats, purge-kyc-evidence) — registered in
 * vercel.json for Vercel Cron to call.
 *
 * Not the same system as /api/cron/clear-earnings, which confirms
 * *recommendation-reward* payouts (confirm_pending_earnings(),
 * pending_earnings_sen) — a different member's module, different table,
 * different money. This route only ever touches affiliate_attributions.
 *
 * Idempotent by construction: clearMaturedCommissions() claims each
 * attribution with an atomic `UPDATE ... WHERE status = 'pending'` before
 * crediting anything, so calling this route twice in a row (a cron retry,
 * an overlapping invocation) cannot double-credit — the second call just
 * finds nothing left to claim. See that function's own doc comment.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const result = await clearMaturedCommissions(service);
  const clearedAmountRM = result.cleared.reduce((sum, c) => sum + c.amountRM, 0);
  const criticalErrors = result.errors.filter((e) => e.critical).length;

  // Audit trail — counts and total amount, not per-user detail (matches the
  // other cron routes' "counts only" response shape).
  console.log(
    `[cron/clear-affiliate-commissions] cleared=${result.cleared.length} amountRM=${clearedAmountRM.toFixed(2)} ` +
      `reversed=${result.reversed.length} skipped=${result.skipped} errors=${result.errors.length} critical=${criticalErrors}`,
  );

  return NextResponse.json({
    cleared: result.cleared.length,
    clearedAmountRM,
    reversed: result.reversed.length,
    skipped: result.skipped,
    errors: result.errors.length,
  });
}
