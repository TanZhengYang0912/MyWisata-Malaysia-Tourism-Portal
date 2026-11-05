import { apiFail, apiOk } from '@/lib/validation/schemas';
import { createServiceClient } from '@/lib/supabase/service';
import { readReviewQueue, reviewQueueQuery } from '@/lib/admin/review-queue';
import { requireStaffRoleManagementSuperAdmin } from '@/lib/staff-permissions/server';
import type { Json } from '@/types/database';

export const dynamic = 'force-dynamic';

type RefundQueryRow = {
  id: string;
  order_id: string;
  amount: number | string;
  reason: string | null;
  reason_code: string | null;
  status: string;
  provider_refund_id: string | null;
  manual_reference: string | null;
  wallet_topup_sen: number | null;
  wallet_earnings_sen: number | null;
  external_amount_sen: number | null;
  provider_failure_code: string | null;
  provider_failure_message: string | null;
  attempt_count: number | null;
  created_at: string;
  updated_at: string;
  payments: { method: string | null; provider: string | null } | Array<{ method: string | null; provider: string | null }> | null;
  orders: { display_id: string | null } | Array<{ display_id: string | null }> | null;
};

export async function GET(request: Request) {
  const { response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const filters = reviewQueueQuery(request, 'refunds');
  if (!filters.success) return apiFail('VALIDATION_FAILED', 'Invalid refund queue filters', 422);
  const service = createServiceClient();
  const { data: queue, error: queueError } = await readReviewQueue(service, 'refunds', filters.data);
  if (queueError) return apiFail('DB_ERROR', 'Unable to load refund requests', 500);
  const ids = (queue?.items ?? []).map((item: { id: string }) => item.id);
  if (ids.length === 0) return apiOk({ ...queue, refunds: [] });
  const { data, error } = await service
    .from('refunds')
    .select('id,order_id,amount,reason,reason_code,status,provider_refund_id,manual_reference,wallet_topup_sen,wallet_earnings_sen,external_amount_sen,provider_failure_code,provider_failure_message,attempt_count,created_at,updated_at,payments(method,provider),orders(display_id)')
    .in('id', ids)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) return apiFail('DB_ERROR', 'Unable to load refund requests', 500);

  try {
    const refunds = await Promise.all(((data ?? []) as unknown as RefundQueryRow[]).map(async (refund) => {
      const { data: evidenceData, error: evidenceError } = await service.rpc('get_event_refund_evidence', { p_refund: refund.id });
      if (evidenceError) throw new Error('refund_evidence_unavailable');
      const payment = Array.isArray(refund.payments) ? refund.payments[0] : refund.payments;
      const order = Array.isArray(refund.orders) ? refund.orders[0] : refund.orders;
      return {
        id: refund.id,
        orderId: refund.order_id,
        orderNumber: order?.display_id ?? null,
        amountRm: Number(refund.amount),
        reason: refund.reason ?? null,
        reasonCode: refund.reason_code ?? null,
        evidence: evidenceData as Json,
        status: refund.status,
        provider: payment?.provider ?? null,
        method: payment?.method ?? null,
        providerRefundId: refund.provider_refund_id ?? null,
        manualReference: refund.manual_reference ?? null,
        walletTopupSen: Number(refund.wallet_topup_sen ?? 0),
        walletEarningsSen: Number(refund.wallet_earnings_sen ?? 0),
        externalAmountSen: Number(refund.external_amount_sen ?? Math.round(Number(refund.amount) * 100)),
        failureCode: refund.provider_failure_code ?? null,
        failureMessage: refund.provider_failure_message ?? null,
        attemptCount: refund.attempt_count ?? 0,
        createdAt: refund.created_at,
        updatedAt: refund.updated_at,
      };
    }));

    return apiOk({ ...queue, refunds });
  } catch { return apiFail('DB_ERROR', 'Unable to load refund evidence', 500); }
}
