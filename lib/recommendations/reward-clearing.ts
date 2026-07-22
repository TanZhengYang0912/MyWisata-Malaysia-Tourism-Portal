import type { SupabaseClient } from '@supabase/supabase-js';

type RewardClearingRow = {
  commission_id: string;
  user_id: string;
  order_id: string | null;
  action: 'cleared' | 'reversed' | 'skipped_kyc' | 'skipped_missing_order' | 'skipped_wallet';
  amount_sen: number | string;
};

export type ClearedRecommendationReward = {
  commissionId: string;
  userId: string;
  orderId: string | null;
  amountSen: number;
};

export type RecommendationRewardClearingResult = {
  cleared: ClearedRecommendationReward[];
  reversed: ClearedRecommendationReward[];
  skipped: number;
};

/**
 * Runs the database-owned recommendation reward lifecycle. The RPC locks the
 * commission and wallet rows, so the result of this call is safe to use for
 * notifications but must never be used to calculate an amount client-side.
 */
export async function clearMaturedRecommendationRewards(
  service: SupabaseClient,
): Promise<RecommendationRewardClearingResult> {
  const { data, error } = await service.rpc('clear_matured_recommendation_rewards');
  if (error) throw new Error(error.message);

  const result: RecommendationRewardClearingResult = { cleared: [], reversed: [], skipped: 0 };
  for (const row of (data ?? []) as RewardClearingRow[]) {
    const reward = {
      commissionId: row.commission_id,
      userId: row.user_id,
      orderId: row.order_id,
      amountSen: Number(row.amount_sen),
    };

    if (row.action === 'cleared') result.cleared.push(reward);
    else if (row.action === 'reversed') result.reversed.push(reward);
    else result.skipped += 1;
  }
  return result;
}
