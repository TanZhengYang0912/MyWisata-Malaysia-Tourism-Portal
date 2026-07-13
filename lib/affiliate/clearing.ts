// P4 — Member 4: commission clearing. CLAUDE-PHASE2.md Feature D, adapted —
// see migration 014's comment for the full explanation of why this design
// differs from the original spec (it assumed the pre-009 wallet columns).
//
// clearMaturedCommissions() is now the ONLY place that credits the real
// wallet for affiliate commissions (via creditAffiliateCommission(), which
// calls the wallet owner's credit_earnings() RPC). attribution.ts no longer
// credits anything at attribution time — money isn't in the affiliate's
// spendable wallet until it clears here.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getClearanceDays } from './settings';
import { creditAffiliateCommission } from './wallet-credit';
import { runFraudSweep } from './fraud';

export interface ClearedCommission {
  attributionId: string;
  userId: string;
  orderId: string;
  amountRM: number;
}

export interface ReversedCommission {
  attributionId: string;
  orderId: string;
  reason: string;
}

export interface ClearingError {
  attributionId: string;
  error: string;
  critical?: boolean; // attribution was claimed 'confirmed' but the wallet credit failed after
}

export interface ClearingResult {
  cleared: ClearedCommission[];
  reversed: ReversedCommission[];
  skipped: number; // already claimed by a concurrent/prior run
  errors: ClearingError[];
}

const REVERSIBLE_ORDER_STATUSES = new Set(['cancelled', 'refunded']);

/**
 * Clears pending affiliate commissions older than the clearance window
 * (platform_settings['wallet.clearance_days'], default 7) into the
 * affiliate's real wallet — status -> 'confirmed', cleared_at set, and only
 * then is credit_earnings() called.
 *
 * `maxAgeDays` overrides the clearance window — pass 0 to clear everything
 * regardless of age (used by the dev force-clear route; never expose this
 * override outside a demo-mode-gated route).
 *
 * Idempotent: each attribution is claimed via an atomic
 * `UPDATE ... WHERE status='pending'` before crediting, so a concurrent or
 * repeated run cannot double-credit. One bad row is caught and logged, not
 * allowed to abort the batch.
 */
export async function clearMaturedCommissions(
  service: SupabaseClient,
  opts?: { maxAgeDays?: number },
): Promise<ClearingResult> {
  const clearanceDays = opts?.maxAgeDays ?? (await getClearanceDays(service));
  const cutoff = new Date(Date.now() - clearanceDays * 86_400_000).toISOString();

  const { data: candidates } = await service
    .from('affiliate_attributions')
    .select('id, click_id, order_id, commission_amount, created_at')
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  const result: ClearingResult = { cleared: [], reversed: [], skipped: 0, errors: [] };

  // CLAUDE-PHASE2.md Feature C: run the fraud sweep alongside clearing, not
  // just from its own admin button — clearing already runs on a schedule
  // (or a "Run clearing" click), so it's a natural place to also catch
  // click-velocity/clustering/zero-conversion patterns. Never allowed to
  // fail the clearing run itself.
  try {
    await runFraudSweep(service);
  } catch (err) {
    console.error('[affiliate] fraud sweep (via clearing) failed', err instanceof Error ? err.message : err);
  }

  for (const attribution of candidates ?? []) {
    try {
      const { data: click } = await service
        .from('affiliate_clicks')
        .select('link_id')
        .eq('id', attribution.click_id)
        .maybeSingle();
      if (!click) {
        result.errors.push({ attributionId: attribution.id, error: 'click not found' });
        continue;
      }
      const { data: link } = await service
        .from('affiliate_links')
        .select('user_id')
        .eq('id', click.link_id)
        .maybeSingle();
      if (!link) {
        result.errors.push({ attributionId: attribution.id, error: 'link not found' });
        continue;
      }

      const { data: order } = await service
        .from('orders')
        .select('status')
        .eq('id', attribution.order_id)
        .maybeSingle();
      if (order && REVERSIBLE_ORDER_STATUSES.has(order.status)) {
        const reversed = await reverseCommission(service, attribution.id, `order ${order.status}`);
        if (reversed) result.reversed.push({ attributionId: attribution.id, orderId: attribution.order_id, reason: `order ${order.status}` });
        else result.skipped++;
        continue;
      }

      // Atomic claim — only proceeds if this row is still 'pending' at the
      // moment of update. A concurrent/repeated run gets zero rows back here.
      const { data: claimed, error: claimErr } = await service
        .from('affiliate_attributions')
        .update({ status: 'confirmed', cleared_at: new Date().toISOString() })
        .eq('id', attribution.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (claimErr) {
        result.errors.push({ attributionId: attribution.id, error: claimErr.message });
        continue;
      }
      if (!claimed) {
        result.skipped++;
        continue;
      }

      try {
        await creditAffiliateCommission(service, link.user_id, Number(attribution.commission_amount), attribution.order_id);
        result.cleared.push({
          attributionId: attribution.id,
          userId: link.user_id,
          orderId: attribution.order_id,
          amountRM: Number(attribution.commission_amount),
        });
      } catch (creditErr) {
        // Claimed (status='confirmed') but the wallet credit failed — a real
        // anomaly needing manual reconciliation, not a normal skip. Logged
        // loudly rather than silently swallowed.
        const message = creditErr instanceof Error ? creditErr.message : String(creditErr);
        console.error('[affiliate] CRITICAL: attribution confirmed but wallet credit failed', attribution.id, message);
        result.errors.push({ attributionId: attribution.id, error: `credited failed after claim: ${message}`, critical: true });
      }
    } catch (err) {
      result.errors.push({ attributionId: attribution.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

/**
 * Reverses a still-pending commission (e.g. the order was cancelled or
 * refunded before it cleared). No wallet adjustment needed — under this
 * module's design, nothing is credited to the wallet until clearing
 * succeeds, so there's nothing to claw back.
 *
 * Returns false (not an error) if the attribution was no longer 'pending'
 * by the time this ran — same idempotent-claim pattern as clearing.
 */
export async function reverseCommission(
  service: SupabaseClient,
  attributionId: string,
  reason: string,
): Promise<boolean> {
  const { data, error } = await service
    .from('affiliate_attributions')
    .update({ status: 'reversed', reversed_at: new Date().toISOString() })
    .eq('id', attributionId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (data) {
    console.log('[affiliate] attribution reversed', attributionId, reason);
  }
  return Boolean(data);
}
