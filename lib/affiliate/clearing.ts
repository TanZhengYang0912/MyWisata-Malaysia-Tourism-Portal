// P4 — Member 4: commission clearing. CLAUDE-PHASE2.md Feature D, adapted —
// see migration 014's comment for the full explanation of why this design
// differs from the original spec (it assumed the pre-009 wallet columns).
//
// clearMaturedCommissions() is now the ONLY place that credits the real
// wallet for affiliate commissions (via creditAffiliateCommission(), which
// calls the wallet owner's credit_earnings() RPC). attribution.ts no longer
// credits anything at attribution time — money isn't in the affiliate's
// spendable wallet until it clears here.
//
// Admin per-attribution review (2026-08-20 request): an admin can Accept or
// Reject a single still-pending attribution from /admin/affiliate's "All
// attributions" table, instead of waiting for the age-gated batch run.
// Accept reuses processAttribution() below — the exact same safety checks
// (reversible-order check, owner-tier/KYC check) the batch job applies —
// just without the maturity-age gate. It is NOT a way to bypass those
// checks. Reject is a genuinely new terminal status distinct from
// 'reversed': 'reversed' means the underlying ORDER was cancelled/refunded
// (automatic, no human actor); 'rejected' means an admin looked at a still
// otherwise-valid attribution and declined to pay it (records who and,
// optionally, why). Neither touches the wallet — nothing is credited until
// 'confirmed', so a still-pending row has nothing to claw back either way.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getClearanceDays } from './settings';
import { creditAffiliateCommission } from './wallet-credit';
import { runFraudSweep } from './fraud';
import { getTierForUser } from './tier';
import { notifyCommissionCleared, notifyCommissionRejected, notifyTierUp } from './notifications';

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

interface AttributionCandidate {
  id: string;
  click_id: string;
  order_id: string;
  commission_amount: number;
  created_at: string;
}

const REVERSIBLE_ORDER_STATUSES = new Set(['cancelled', 'refunded']);

/**
 * Processes ONE still-pending attribution through the full clearing
 * pipeline — reversible-order check, owner-tier/KYC check, atomic claim,
 * wallet credit, notifications, tier-up check — mutating `result` in place.
 * Shared by clearMaturedCommissions()'s batch loop and acceptAttribution()'s
 * single-row manual path, so neither can silently diverge from the other's
 * safety checks.
 */
async function processAttribution(
  service: SupabaseClient,
  attribution: AttributionCandidate,
  result: ClearingResult,
): Promise<void> {
  try {
    const { data: click } = await service
      .from('affiliate_clicks')
      .select('link_id')
      .eq('id', attribution.click_id)
      .maybeSingle();
    if (!click) {
      result.errors.push({ attributionId: attribution.id, error: 'click not found' });
      return;
    }
    const { data: link } = await service
      .from('affiliate_links')
      .select('user_id')
      .eq('id', click.link_id)
      .maybeSingle();
    if (!link) {
      result.errors.push({ attributionId: attribution.id, error: 'link not found' });
      return;
    }

    // Limited profile-complete links can attribute commissions, but money
    // stays pending until the owner completes approved KYC.
    const { data: owner } = await service
      .from('users')
      .select('tier, kyc_status')
      .eq('id', link.user_id)
      .maybeSingle();
    if (owner?.tier !== 'kyc_verified' || owner?.kyc_status !== 'approved') {
      result.skipped++;
      return;
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
      return;
    }

    // CLAUDE-P4-EXTRAS.md Extra 3: tier is a function of lifetime CONFIRMED
    // referrals (lib/affiliate/tier.ts), and this attribution's status is
    // still 'pending' at this point — so this read is the "before" state
    // for the tier-up comparison after the claim below.
    const tierBefore = await getTierForUser(service, link.user_id);

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
      return;
    }
    if (!claimed) {
      result.skipped++;
      return;
    }

    try {
      await creditAffiliateCommission(service, link.user_id, Number(attribution.commission_amount), attribution.order_id);
      result.cleared.push({
        attributionId: attribution.id,
        userId: link.user_id,
        orderId: attribution.order_id,
        amountRM: Number(attribution.commission_amount),
      });

      // Fire-and-forget, never throws (lib/affiliate/notifications.ts) —
      // only reached once per attribution, since the atomic claim above
      // already guarantees this credit only ever runs once.
      await notifyCommissionCleared(service, {
        userId: link.user_id,
        amountRM: Number(attribution.commission_amount),
        attributionId: attribution.id,
      });
      const tierAfter = await getTierForUser(service, link.user_id);
      if (tierAfter.tierName !== tierBefore.tierName) {
        await notifyTierUp(service, {
          userId: link.user_id,
          tierName: tierAfter.tierName,
          ratePercent: Number((tierAfter.rate * 100).toFixed(2)),
          attributionId: attribution.id,
        });
      }
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
    await processAttribution(service, attribution, result);
  }

  return result;
}

export type AcceptOutcome = 'confirmed' | 'reversed' | 'skipped' | 'error';

export interface AcceptResult {
  outcome: AcceptOutcome;
  amountRM?: number;
  error?: string;
}

/**
 * Admin manual "Accept" on a single pending attribution — /admin/affiliate's
 * "All attributions" table. Runs processAttribution(), the exact same
 * per-row pipeline clearMaturedCommissions() uses, just for one row and
 * without the maturity-age gate (that's the whole point of a manual
 * override — an admin can approve a fresh referral immediately). Still
 * subject to the same reversible-order and owner-tier/KYC checks — an admin
 * cannot force-pay a commission for a cancelled order or an unverified
 * owner through this path.
 */
export async function acceptAttribution(service: SupabaseClient, attributionId: string): Promise<AcceptResult> {
  const { data: attribution, error } = await service
    .from('affiliate_attributions')
    .select('id, click_id, order_id, commission_amount, created_at, status')
    .eq('id', attributionId)
    .maybeSingle();
  if (error) return { outcome: 'error', error: error.message };
  if (!attribution) return { outcome: 'error', error: 'Attribution not found' };
  if (attribution.status !== 'pending') return { outcome: 'skipped', error: `Already ${attribution.status}` };

  const result: ClearingResult = { cleared: [], reversed: [], skipped: 0, errors: [] };
  await processAttribution(service, attribution, result);

  if (result.errors.length > 0) return { outcome: 'error', error: result.errors[0].error };
  if (result.reversed.length > 0) return { outcome: 'reversed' }; // the order turned out to be cancelled/refunded
  if (result.cleared.length > 0) return { outcome: 'confirmed', amountRM: result.cleared[0].amountRM };
  return { outcome: 'skipped', error: 'Not eligible yet (owner has not completed KYC)' };
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

export interface RejectResult {
  rejected: boolean;
  error?: string;
}

/**
 * Admin manual "Reject" on a single pending attribution — the deliberate
 * counterpart to acceptAttribution(). Distinct from reverseCommission():
 * 'reversed' is the automatic, no-actor outcome of the underlying order
 * being cancelled/refunded; 'rejected' is a human admin decision, recorded
 * with who (rejected_by) and optionally why (reason, notified to the
 * affiliate but not persisted as a column — this module doesn't have a
 * free-text audit column on this table yet, matching how reverseCommission()
 * only logs its reason rather than storing it).
 *
 * Same atomic-claim idempotency as every other status transition here — a
 * repeat call against an already-resolved row returns rejected:false, not
 * an error.
 */
export async function rejectAttribution(
  service: SupabaseClient,
  attributionId: string,
  adminId: string,
  reason?: string,
): Promise<RejectResult> {
  const { data, error } = await service
    .from('affiliate_attributions')
    .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: adminId })
    .eq('id', attributionId)
    .eq('status', 'pending')
    .select('id, click_id, commission_amount')
    .maybeSingle();
  if (error) return { rejected: false, error: error.message };
  if (!data) return { rejected: false, error: 'Attribution is not pending (already resolved)' };

  const { data: click } = await service.from('affiliate_clicks').select('link_id').eq('id', data.click_id).maybeSingle();
  const { data: link } = click
    ? await service.from('affiliate_links').select('user_id').eq('id', click.link_id).maybeSingle()
    : { data: null };
  if (link) {
    await notifyCommissionRejected(service, {
      userId: link.user_id,
      amountRM: Number(data.commission_amount),
      attributionId,
      reason,
    });
  }

  return { rejected: true };
}
