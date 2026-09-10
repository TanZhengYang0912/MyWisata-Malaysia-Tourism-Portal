// P4 — per-order money reconciliation for admins.
//
// Shows that every paid order balances: customer paid = Σ vendor gross, and the
// platform's commission funds the referral payouts on that order —
//   platform_net = platform_fee - affiliate_payout - recommendation_payout
// which can go negative on a small order that triggered the RM50 recommendation
// first-sale bonus (an accepted acquisition cost; flagged, not blocked).

import type { SupabaseClient } from '@supabase/supabase-js';

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

const toSen = (rm: number | string | null | undefined) => Math.round(Number(rm ?? 0) * 100);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

export async function getOrderMoneyReconciliation(
  service: SupabaseClient,
  range: { fromISO: string; toISO: string },
): Promise<OrderReconciliation> {
  const empty: OrderReconciliation = {
    rows: [],
    totals: { grossSen: 0, platformFeeSen: 0, vendorNetSen: 0, affiliatePayoutSen: 0, recommendationPayoutSen: 0, platformNetSen: 0, negativeOrders: 0 },
  };

  const { data: settlements, error } = await service
    .from('order_settlements')
    .select('order_id, gross_sen, platform_fee_sen, vendor_net_sen, reversed_amount_sen, orders!inner(display_id, status, paid_at, created_at)')
    .gte('orders.created_at', range.fromISO)
    .lt('orders.created_at', range.toISO)
    .limit(5000);
  if (error || !settlements) return empty;

  type SRow = {
    order_id: string;
    gross_sen: number | string;
    platform_fee_sen: number | string;
    vendor_net_sen: number | string;
    reversed_amount_sen: number | string;
    orders: { display_id: string | null; status: string; paid_at: string | null; created_at: string } | null;
  };
  const rows = settlements as unknown as SRow[];
  if (rows.length === 0) return empty;

  const orderIds = [...new Set(rows.map((r) => r.order_id))];

  const [{ data: affRows }, { data: recRows }] = await Promise.all([
    service.from('affiliate_attributions').select('order_id, commission_amount, status').in('order_id', orderIds),
    service.from('recommendation_commissions').select('order_id, amount, status').in('order_id', orderIds),
  ]);

  const affByOrder = new Map<string, number>();
  for (const a of (affRows ?? []) as { order_id: string; commission_amount: number | string; status: string }[]) {
    if (a.status === 'reversed' || a.status === 'rejected') continue;
    affByOrder.set(a.order_id, (affByOrder.get(a.order_id) ?? 0) + toSen(a.commission_amount));
  }
  const recByOrder = new Map<string, number>();
  for (const r of (recRows ?? []) as { order_id: string | null; amount: number | string; status: string }[]) {
    if (!r.order_id || r.status === 'reversed') continue;
    recByOrder.set(r.order_id, (recByOrder.get(r.order_id) ?? 0) + toSen(r.amount));
  }

  const byOrder = new Map<string, OrderReconciliationRow>();
  for (const r of rows) {
    const existing = byOrder.get(r.order_id);
    const grossSen = Number(r.gross_sen);
    const platformFeeSen = Number(r.platform_fee_sen);
    const vendorNetSen = Number(r.vendor_net_sen) - Number(r.reversed_amount_sen);
    if (existing) {
      existing.grossSen += grossSen;
      existing.platformFeeSen += platformFeeSen;
      existing.vendorNetSen += vendorNetSen;
    } else {
      byOrder.set(r.order_id, {
        orderId: r.order_id,
        orderDisplayId: r.orders?.display_id ?? null,
        status: r.orders?.status ?? 'unknown',
        paidAt: r.orders?.paid_at ?? null,
        grossSen,
        platformFeeSen,
        vendorNetSen,
        affiliatePayoutSen: affByOrder.get(r.order_id) ?? 0,
        recommendationPayoutSen: recByOrder.get(r.order_id) ?? 0,
        platformNetSen: 0,
        platformNetNegative: false,
      });
    }
  }

  const out = [...byOrder.values()].map((row) => {
    row.platformNetSen = row.platformFeeSen - row.affiliatePayoutSen - row.recommendationPayoutSen;
    row.platformNetNegative = row.platformNetSen < 0;
    return row;
  });
  out.sort((a, b) => (a.paidAt ?? '') < (b.paidAt ?? '') ? 1 : -1);

  return {
    rows: out,
    totals: {
      grossSen: sum(out.map((r) => r.grossSen)),
      platformFeeSen: sum(out.map((r) => r.platformFeeSen)),
      vendorNetSen: sum(out.map((r) => r.vendorNetSen)),
      affiliatePayoutSen: sum(out.map((r) => r.affiliatePayoutSen)),
      recommendationPayoutSen: sum(out.map((r) => r.recommendationPayoutSen)),
      platformNetSen: sum(out.map((r) => r.platformNetSen)),
      negativeOrders: out.filter((r) => r.platformNetNegative).length,
    },
  };
}
