// P4 — recommendation earnings, read side.
//
// The recommendation reward money path (credit_pending_recommendation ->
// clear_matured_recommendation_rewards) writes recommendation_commissions and
// the wallet buckets; nothing in the app has ever READ recommendation_commissions
// back for the recommender. This is that read — deliberately shaped to parallel
// AffiliateCommission in lib/affiliate/stats.ts so the same row UI renders both.
//
// RLS: rec_commissions_read_own, rec_conv_read and vendor_rec_read all allow
// `auth.uid() = recommender_id`, so the cookie-aware client resolves the whole
// commission -> conversion -> recommendation -> vendor_name chain on its own —
// no service client needed (unlike getAffiliateStats, which needs one only for
// the order-total lookup RLS can't express).

import type { SupabaseClient } from '@supabase/supabase-js';
import { add } from '@/lib/money';

export interface RecommendationCommissionRow {
  id: string;
  /** Deep-link target for /customer/recommendations/<id>; null if the join can't resolve. */
  recommendationId: string | null;
  vendorName: string | null;
  type: 'bonus' | 'ongoing';
  /** Ongoing rows only — the % stamped on at credit time. */
  rate: number | null;
  amount: number; // RM
  status: 'pending' | 'confirmed' | 'reversed';
  createdAt: string;
  /** Days until a pending row's hold matures, floored at 0. null unless pending. */
  clearsInDays: number | null;
}

export interface RecommendationEarnings {
  totals: {
    /** Σ pending commission amounts (RM). */
    pending: number;
    /** Σ commission amounts already cleared to the withdrawable wallet (RM). */
    lifetimeCleared: number;
    /** Distinct converted vendors this recommender has earned from. */
    convertedVendors: number;
  };
  /** Newest first. Includes reversed rows (shown, but excluded from totals). */
  commissions: RecommendationCommissionRow[];
}

type CommissionQueryRow = {
  id: string;
  conversion_id: string | null;
  commission_type: string;
  amount: number | string;
  commission_rate: number | string | null;
  status: string;
  hold_until: string | null;
  created_at: string;
  recommendation_conversions:
    | { recommendation_id: string | null; vendor_recommendations: { id: string; vendor_name: string | null } | null }
    | null;
};

function clearsInDays(holdUntil: string | null): number | null {
  if (!holdUntil) return null;
  const remainingMs = new Date(holdUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 86_400_000));
}

const EMPTY: RecommendationEarnings = {
  totals: { pending: 0, lifetimeCleared: 0, convertedVendors: 0 },
  commissions: [],
};

export async function getRecommendationEarnings(
  client: SupabaseClient,
  userId: string,
): Promise<RecommendationEarnings> {
  const { data, error } = await client
    .from('recommendation_commissions')
    .select(
      'id, conversion_id, commission_type, amount, commission_rate, status, hold_until, created_at, ' +
        'recommendation_conversions(recommendation_id, vendor_recommendations(id, vendor_name))',
    )
    .eq('recommender_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return EMPTY;

  const rows = data as unknown as CommissionQueryRow[];

  const commissions: RecommendationCommissionRow[] = rows.map((row) => {
    const rec = row.recommendation_conversions?.vendor_recommendations ?? null;
    const status = row.status === 'confirmed' || row.status === 'reversed' ? row.status : 'pending';
    return {
      id: row.id,
      recommendationId: rec?.id ?? row.recommendation_conversions?.recommendation_id ?? null,
      vendorName: rec?.vendor_name ?? null,
      type: row.commission_type === 'bonus' ? 'bonus' : 'ongoing',
      rate: row.commission_rate === null ? null : Number(row.commission_rate),
      amount: Number(row.amount),
      status,
      createdAt: row.created_at,
      clearsInDays: status === 'pending' ? clearsInDays(row.hold_until) : null,
    };
  });

  const pending = commissions
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => add(sum, c.amount), 0);
  const lifetimeCleared = commissions
    .filter((c) => c.status === 'confirmed')
    .reduce((sum, c) => add(sum, c.amount), 0);
  const convertedVendors = new Set(
    rows.filter((r) => r.status !== 'reversed' && r.conversion_id).map((r) => r.conversion_id),
  ).size;

  return { totals: { pending, lifetimeCleared, convertedVendors }, commissions };
}
