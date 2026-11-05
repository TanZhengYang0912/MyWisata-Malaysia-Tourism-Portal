import type { SupabaseClient } from '@supabase/supabase-js';

export type AffiliateCreditResult =
  | { outcome: 'skipped' }
  | { outcome: 'review_required' }
  | { outcome: 'order_review_required'; reason: string }
  | { outcome: 'reversed'; reason: string }
  | { outcome: 'confirmed'; userId: string; orderId: string; amountRM: number };

/** SQL derives money inputs and commits the attribution and canonical ledger together. */
export async function creditAffiliateCommission(
  service: SupabaseClient,
  attributionId: string,
  maturedBefore: string | null = null,
): Promise<AffiliateCreditResult> {
  const { data, error } = await service.rpc('clear_affiliate_commission', {
    p_attribution_id: attributionId,
    p_matured_before: maturedBefore,
  });
  // Never fall back to split writes when the atomic operation is unavailable.
  if (error) throw new Error('Affiliate clearing is unavailable; retry the pending commission.');
  const result: unknown = data;
  if (!result || typeof result !== 'object' || !('outcome' in result)) throw new Error('Invalid affiliate clearing response');
  if (result.outcome === 'skipped') return { outcome: 'skipped' };
  if (result.outcome === 'review_required') return { outcome: 'review_required' };
  if (result.outcome === 'order_review_required' && 'reason' in result && typeof result.reason === 'string') {
    return { outcome: 'order_review_required', reason: result.reason };
  }
  if (result.outcome === 'reversed' && 'reason' in result && typeof result.reason === 'string') {
    return { outcome: 'reversed', reason: result.reason };
  }
  if (result.outcome === 'confirmed' && 'user_id' in result && typeof result.user_id === 'string'
    && 'order_id' in result && typeof result.order_id === 'string' && 'amount_rm' in result) {
    const amountRM = typeof result.amount_rm === 'number' ? result.amount_rm : Number(result.amount_rm);
    if (Number.isFinite(amountRM) && amountRM > 0) return { outcome: 'confirmed', userId: result.user_id, orderId: result.order_id, amountRM };
  }
  throw new Error('Invalid affiliate clearing response');
}
