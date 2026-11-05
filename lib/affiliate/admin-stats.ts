// P4 — Member 4: admin affiliate oversight. See CLAUDE.md Step 9.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveTiers, type CommissionTier } from './tier';
import type { Funnel } from './funnel';
import { z } from 'zod';
import { getClearanceDaysForPreview } from './settings';

export interface AffiliateAdminTotals {
  totalAffiliates: number;
  totalClicks: number;
  totalReferrals: number;
  totalCommission: number; // non-reversed attributions only
}

export interface TopEarner {
  userId: string;
  userName: string;
  affiliateCode: string;
  referrals: number;
  commission: number;
  tierName: string;
}

export interface AffiliateAttributionRow {
  id: string;
  userId: string; // link owner
  userName: string;
  productId: string | null;
  productName: string | null;
  orderId: string;
  commissionAmount: number;
  status: string;
  createdAt: string;
  reviewStatus: 'pending' | 'released' | 'rejected' | null;
  reviewVersion: number | null;
  reviewEvidence: string | null;
  releaseCheck: { reason: string | null; orderChecksPassed: boolean; matured: boolean; eligibleAfter: string } | null;
}

export interface AffiliateAdminStats {
  totals: AffiliateAdminTotals;
  tiers: CommissionTier[];
  topEarners: TopEarner[];
  attributions: AffiliateAttributionRow[];
  attributionTotalCount: number;
  attributionPageSize: number;
  attributionHasMore: boolean;
  attributionNextCursor: { sortValue: string; createdAt: string; id: string } | null;
  attributionSnapshotCutoff: string;
  maturityExposure: AffiliateMaturityExposure;
  /** CLAUDE-FUNNEL-AI.md §12.3 — platform-wide, all users. Same honesty rules as the per-user funnel. */
  funnel: Funnel;
}

export interface AffiliateMaturityExposure {
  generatedAt: string;
  pending: { count: number; amountRM: number };
  confirmedOnPaidOrders: { count: number; amountRM: number };
  confirmedOnRefundedOrders: { count: number; amountRM: number };
  confirmedOnOtherStatuses: { count: number; amountRM: number };
}

const exposurePartSchema = z.object({ count: z.number().finite().nonnegative(), amount_rm: z.number().finite().nonnegative() });
const exposureSchema = z.object({
  generated_at: z.string(),
  pending: exposurePartSchema,
  confirmed_on_paid_orders: exposurePartSchema,
  confirmed_on_refunded_orders: exposurePartSchema,
  confirmed_on_other_statuses: exposurePartSchema,
});

export interface AffiliateAdminAttributionQuery {
  status?: string | null;
  search?: string | null;
  sortKey?: 'createdAt' | 'userName' | 'productName' | 'status';
  sortDir?: 'asc' | 'desc';
  pageSize?: 10 | 25 | 50;
  cursor?: { sortValue: string; createdAt: string; id: string } | null;
  snapshotCutoff?: string;
}

export interface AffiliateAdminAttributionPage {
  snapshotCutoff: string;
  totalCount: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor: { sortValue: string; createdAt: string; id: string } | null;
  items: AffiliateAttributionRow[];
}

const adminSummarySchema = z.object({
  totals: z.object({
    totalAffiliates: z.number().finite().nonnegative(),
    totalClicks: z.number().finite().nonnegative(),
    totalReferrals: z.number().finite().nonnegative(),
    totalCommission: z.number().finite(),
  }),
  topEarners: z.array(z.object({
    userId: z.string(), userName: z.string(), affiliateCode: z.string(),
    referrals: z.number().finite().nonnegative(), commission: z.number().finite(), tierName: z.string(),
  })),
  funnel: z.object({
    shares: z.number().finite().nonnegative(), clicks: z.number().finite().nonnegative(),
    conversions: z.number().finite().nonnegative(), shareToClickRate: z.number().finite().nullable(),
    clickToConversionRate: z.number().finite().nullable(), sourceTrackingActive: z.boolean(),
    byPlatform: z.array(z.object({ platform: z.string(), shares: z.number().finite().nonnegative(),
      clicks: z.number().finite().nullable(), conversions: z.number().finite().nullable() })),
  }),
});

const attributionPageSchema = z.object({
  snapshotCutoff: z.string(), totalCount: z.number().finite().nonnegative(), pageSize: z.number(),
  hasMore: z.boolean(), nextCursor: z.object({ sortValue: z.string(), createdAt: z.string(), id: z.string() }).nullable(),
  items: z.array(z.object({
    id: z.string(), userId: z.string(), userName: z.string(), productId: z.string().nullable(),
    productName: z.string().nullable(), orderId: z.string(), commissionAmount: z.number(), status: z.string(),
    createdAt: z.string(), reviewStatus: z.enum(['pending','released','rejected']).nullable(),
    reviewVersion: z.number().nullable(), reviewEvidence: z.string().nullable(),
  })),
});

const releasePreviewSchema = z.array(z.object({
  id: z.string(),
  reason: z.string().nullable(),
}));

export async function getAdminAffiliateAttributionPage(
  service: SupabaseClient,
  query: AffiliateAdminAttributionQuery = {},
): Promise<AffiliateAdminAttributionPage> {
  const { data, error } = await service.rpc('get_admin_affiliate_attribution_page', {
    p_snapshot_cutoff: query.snapshotCutoff ?? new Date().toISOString(),
    p_status: query.status && query.status !== 'all' ? query.status : null,
    p_search: query.search?.trim() || null,
    p_sort_key: query.sortKey ?? 'createdAt',
    p_sort_dir: query.sortDir ?? 'desc',
    p_page_size: query.pageSize ?? 10,
    p_cursor: query.cursor ?? null,
  });
  const page = attributionPageSchema.safeParse(data);
  if (error || !page.success) throw new Error('affiliate_attributions_unavailable');
  const pendingIds = page.data.items.filter((item) => item.status === 'pending').map((item) => item.id);
  if (pendingIds.length === 0) return { ...page.data, items: page.data.items.map((item) => ({ ...item, releaseCheck: null })) };

  const [previewResult, clearanceDays] = await Promise.all([
    service.rpc('get_affiliate_order_release_preview', { p_attribution_ids: pendingIds }),
    getClearanceDaysForPreview(service),
  ]);
  const preview = releasePreviewSchema.safeParse(previewResult.data);
  if (previewResult.error || !preview.success) throw new Error('affiliate_order_preview_unavailable');
  const previewById = new Map(preview.data.map((item) => [item.id, item.reason]));
  const now = Date.now();
  return {
    ...page.data,
    items: page.data.items.map((item) => {
      if (item.status !== 'pending') return { ...item, releaseCheck: null };
      const eligibleAfter = new Date(Date.parse(item.createdAt) + clearanceDays * 86_400_000).toISOString();
      const reason = previewById.has(item.id) ? previewById.get(item.id)! : 'preview_unavailable';
      return { ...item, releaseCheck: { reason, orderChecksPassed: reason === null, matured: Date.parse(eligibleAfter) <= now, eligibleAfter } };
    }),
  };
}

export async function getAffiliateAdminStats(
  service: SupabaseClient,
  query: AffiliateAdminAttributionQuery = {},
): Promise<AffiliateAdminStats> {
  const snapshotCutoff = query.snapshotCutoff ?? new Date().toISOString();
  const [summaryResult, exposureResult, page, tiers] = await Promise.all([
    service.rpc('get_affiliate_admin_summary'),
    service.rpc('affiliate_maturity_exposure'),
    getAdminAffiliateAttributionPage(service, { ...query, snapshotCutoff }),
    getActiveTiers(service),
  ]);
  if (summaryResult.error || exposureResult.error) {
    throw new Error('affiliate_admin_stats_unavailable');
  }

  const summary = adminSummarySchema.safeParse(summaryResult.data);
  const parsedExposure = exposureSchema.safeParse(exposureResult.data);
  if (!summary.success || !parsedExposure.success) {
    throw new Error('affiliate_admin_stats_invalid');
  }

  const exposure = parsedExposure.data;
  return {
    totals: summary.data.totals,
    tiers,
    topEarners: summary.data.topEarners,
    attributions: page.items,
    attributionTotalCount: page.totalCount,
    attributionPageSize: page.pageSize,
    attributionHasMore: page.hasMore,
    attributionNextCursor: page.nextCursor,
    attributionSnapshotCutoff: page.snapshotCutoff,
    maturityExposure: {
      generatedAt: exposure.generated_at,
      pending: { count: exposure.pending.count, amountRM: exposure.pending.amount_rm },
      confirmedOnPaidOrders: { count: exposure.confirmed_on_paid_orders.count, amountRM: exposure.confirmed_on_paid_orders.amount_rm },
      confirmedOnRefundedOrders: { count: exposure.confirmed_on_refunded_orders.count, amountRM: exposure.confirmed_on_refunded_orders.amount_rm },
      confirmedOnOtherStatuses: { count: exposure.confirmed_on_other_statuses.count, amountRM: exposure.confirmed_on_other_statuses.amount_rm },
    },
    funnel: summary.data.funnel,
  };
}
