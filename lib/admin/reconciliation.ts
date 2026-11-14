// P4 — internal per-order allocation report for admins. This reads platform
// settlement and commission records; it does not verify bank or provider payout.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventOperationsFilters } from './event-operations-filters';

export interface OrderReconciliationRow {
  orderId: string;
  orderDisplayId: string | null;
  status: string;
  paidAt: string | null;
  grossSen: number;
  platformFeeSen: number;
  vendorNetSen: number;
  affiliatePayoutSen: number;
  recommendationPayoutSen: number;
  platformNetSen: number;
  /** platform_net < 0 — the order's referral payouts exceeded the commission collected. */
  platformNetNegative: boolean;
}

export interface OrderReconciliation {
  rows: OrderReconciliationRow[];
  total: number;
  statusOptions: string[];
  page: number;
  pageSize: number;
  totals: {
    grossSen: number;
    platformFeeSen: number;
    vendorNetSen: number;
    affiliatePayoutSen: number;
    recommendationPayoutSen: number;
    platformNetSen: number;
    negativeOrders: number;
  };
}

export async function getOrderMoneyReconciliation(
  service: SupabaseClient,
  range: { fromISO: string; toISO: string },
  options: {
    filters?: { search?: string; status?: string; net?: 'all' | 'positive' | 'zero' | 'negative' };
    page?: number;
    pageSize?: number;
  } = {},
): Promise<OrderReconciliation> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 15;
  if (!Number.isInteger(page) || page < 1 || ![15, 25, 50, 10001].includes(pageSize)) {
    throw new Error('Invalid reconciliation pagination');
  }
  const filters = options.filters ?? {};
  const { data, error } = await service.rpc('get_admin_order_money_reconciliation', {
    p_from: range.fromISO,
    p_to: range.toISO,
    p_search: filters.search?.trim() ?? '',
    p_status: filters.status && filters.status !== 'all' ? filters.status : null,
    p_net: filters.net ?? 'all',
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw new Error('Unable to load order reconciliation', { cause: error });
  if (!data || typeof data !== 'object') throw new Error('Order reconciliation returned no result');
  const result = data as OrderReconciliation;
  if (!Array.isArray(result.rows) || !result.totals || !Number.isInteger(result.total)
    || !Array.isArray(result.statusOptions) || !Number.isInteger(result.page) || !Number.isInteger(result.pageSize)) {
    throw new Error('Order reconciliation returned an invalid result');
  }
  return result;
}

export interface EventOperations {
  cases: { id: string; version: number; kind: string; reasonCode: string; orderNumber: string | null; orderId: string;
    assignedName: string | null; assigned: boolean; dueAt: string | null; createdAt: string; overdue: boolean;
    refundStatus: string | null; refundId: string | null; outstandingSen: number;
    state: 'open' | 'resolved'; handling: 'needs_review' | 'awaiting_provider' | 'refund_failed' | 'resolved';
    resolutionCode?: 'customer_no_show' | 'collected' | 'refunded' | null; resolutionNote?: string | null;
    pickupItems?: { name: string; quantity: number; pickupDate: string; status: string; vendorName: string; pickupLabel: string }[];
    isMine: boolean; resolvedAt: string | null; refundCompleted: boolean }[];
  total: number; matchingOutstandingSen: number; page: number; pageSize: number;
  summary: { open: number; unassigned: number; undated: number; overdue: number; outstandingSen: number };
  jobs: { jobKey: string; status: 'never_run' | 'running' | 'failed' | 'stale' | 'succeeded'; finishedAt: string | null }[];
}

export async function getEventReservationOperations(
  service: SupabaseClient, query?: { actorId: string; filters: EventOperationsFilters },
): Promise<EventOperations> {
  const { data, error } = query
    ? await service.rpc('get_event_reservation_operations_filtered', { p_actor: query.actorId, p_filters: query.filters })
    : await service.rpc('get_event_reservation_operations');
  if (error || !data) throw new Error('event_operations_unavailable');
  const maxAgeMinutes = Number(process.env.EVENT_JOB_MAX_AGE_MINUTES ?? 15);
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0) throw new Error('event_job_health_configuration_invalid');
  return {
    cases: data.cases.map((row: EventOperations['cases'][number]) => ({
      ...row, state: row.state ?? 'open', handling: row.handling ?? 'needs_review',
      isMine: row.isMine ?? false, resolvedAt: row.resolvedAt ?? null, refundCompleted: row.refundCompleted ?? false,
    })), summary: data.summary,
    total: data.total ?? data.summary.open, matchingOutstandingSen: data.matchingOutstandingSen ?? data.summary.outstandingSen,
    page: data.page ?? 1, pageSize: data.pageSize ?? 100,
    jobs: ['expire_checkout_sessions', 'process_event_refunds'].map((jobKey) => {
      const run = data.runs.find((r: { jobKey: string }) => r.jobKey === jobKey);
      const status = !run ? 'never_run' : run.status === 'failed' ? 'failed'
        : Date.now() - Date.parse(run.finishedAt ?? run.startedAt) > maxAgeMinutes * 60000 ? 'stale' : run.status;
      return { jobKey, status, finishedAt: run?.finishedAt ?? null };
    }),
  };
}
