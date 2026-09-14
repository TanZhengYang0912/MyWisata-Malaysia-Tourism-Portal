// P4 — vendor order settlement, read + wire helpers.
//
// The money path itself is DB-owned (migration 20260911000000): the RPCs
// settle_order_vendor_earnings / clear_matured_vendor_settlements /
// reverse_order_vendor_settlement do all wallet movement. This module is the
// thin server wrappers that call them post-payment (mirroring how
// lib/affiliate/attribution.ts::onOrderPaid is wired) and the read side for
// the vendor-facing panel.

import type { SupabaseClient } from '@supabase/supabase-js';
import { add } from '@/lib/money';

export interface VendorSettlementRow {
  id: string;
  orderId: string;
  orderDisplayId: string | null;
  grossSen: number;
  platformFeeSen: number;
  vendorNetSen: number;
  platformRate: number;
  status: 'pending' | 'confirmed' | 'reversed';
  /** Days until a pending settlement's hold matures, floored at 0. null unless pending. */
  clearsInDays: number | null;
  createdAt: string;
}

export interface VendorSettlements {
  totals: {
    /** Σ vendor net still held (RM sen). */
    pendingSen: number;
    /** Σ vendor net already cleared to the spendable wallet (RM sen). */
    clearedSen: number;
    /** Σ platform commission taken across all non-reversed settlements (RM sen). */
    lifetimePlatformFeesSen: number;
  };
  settlements: VendorSettlementRow[];
}

const EMPTY: VendorSettlements = {
  totals: { pendingSen: 0, clearedSen: 0, lifetimePlatformFeesSen: 0 },
  settlements: [],
};

type Row = {
  id: string;
  order_id: string;
  gross_sen: number | string;
  platform_fee_sen: number | string;
  vendor_net_sen: number | string;
  platform_rate: number | string;
  status: string;
  hold_until: string | null;
  reversed_amount_sen: number | string;
  created_at: string;
  orders: { display_id: string | null } | null;
};

function clearsInDays(holdUntil: string | null): number | null {
  if (!holdUntil) return null;
  return Math.max(0, Math.ceil((new Date(holdUntil).getTime() - Date.now()) / 86_400_000));
}

/** `service` may be the cookie-aware client — order_settlements has an own-vendor SELECT policy. */
export async function getVendorSettlements(
  service: SupabaseClient,
  vendorId: string,
): Promise<VendorSettlements> {
  const { data, error } = await service
    .from('order_settlements')
    .select('id, order_id, gross_sen, platform_fee_sen, vendor_net_sen, platform_rate, status, hold_until, reversed_amount_sen, created_at, orders(display_id)')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (error || !data) return EMPTY;
  const rows = data as unknown as Row[];

  const settlements: VendorSettlementRow[] = rows.map((row) => {
    const status = row.status === 'confirmed' || row.status === 'reversed' ? row.status : 'pending';
    return {
      id: row.id,
      orderId: row.order_id,
      orderDisplayId: row.orders?.display_id ?? null,
      grossSen: Number(row.gross_sen),
      platformFeeSen: Number(row.platform_fee_sen),
      vendorNetSen: Number(row.vendor_net_sen),
      platformRate: Number(row.platform_rate),
      status,
      clearsInDays: status === 'pending' ? clearsInDays(row.hold_until) : null,
      createdAt: row.created_at,
    };
  });

  const netFor = (r: Row) => Number(r.vendor_net_sen) - Number(r.reversed_amount_sen);
  const totals = {
    pendingSen: rows.filter((r) => r.status === 'pending').reduce((s, r) => add(s, netFor(r)), 0),
    clearedSen: rows.filter((r) => r.status === 'confirmed').reduce((s, r) => add(s, netFor(r)), 0),
    lifetimePlatformFeesSen: rows.filter((r) => r.status !== 'reversed').reduce((s, r) => add(s, Number(r.platform_fee_sen)), 0),
  };

  return { totals, settlements };
}

/**
 * Credits every vendor on a paid order their held net share, minus platform
 * commission. Idempotent (order_settlements unique key). Never throws — a
 * settlement failure must not misrepresent a completed payment; the
 * wallet-maintenance backstop re-settles any order this missed.
 */
export async function settleOrderVendorEarnings(service: SupabaseClient, orderId: string): Promise<void> {
  try {
    const { error } = await service.rpc('settle_order_vendor_earnings', { p_order_id: orderId });
    if (error) console.error('[vendor-settlement] settle failed', orderId, error.message);
  } catch (err) {
    console.error('[vendor-settlement] settle threw', orderId, err instanceof Error ? err.message : err);
  }
}

/** Claws back the refunded fraction of a vendor's settlement (confirmed rows / partial refunds). */
export async function reverseOrderVendorSettlement(
  service: SupabaseClient,
  orderId: string,
  refundAmountSen?: number,
): Promise<void> {
  try {
    const { error } = await service.rpc('reverse_order_vendor_settlement', {
      p_order_id: orderId,
      p_refund_amount_sen: refundAmountSen ?? null,
    });
    if (error) console.error('[vendor-settlement] reverse failed', orderId, error.message);
  } catch (err) {
    console.error('[vendor-settlement] reverse threw', orderId, err instanceof Error ? err.message : err);
  }
}

const BACKSTOP_WINDOW_DAYS = 14;

export interface VendorSettlementMaintenanceResult {
  cleared: number;
  reversed: number;
  backfilled: number;
  clawedBack: number;
}

/**
 * Authoritative reconciliation pass for the wallet-maintenance cron. The
 * post-payment wire is best-effort; this is what guarantees every paid order
 * eventually settles and every refunded order eventually claws back.
 */
export async function runVendorSettlementMaintenance(
  service: SupabaseClient,
): Promise<VendorSettlementMaintenanceResult> {
  const result: VendorSettlementMaintenanceResult = { cleared: 0, reversed: 0, backfilled: 0, clawedBack: 0 };

  const { data: matured } = await service.rpc('clear_matured_vendor_settlements');
  for (const row of (matured ?? []) as { action: string }[]) {
    if (row.action === 'cleared') result.cleared += 1;
    else if (row.action === 'reversed') result.reversed += 1;
  }

  const since = new Date(Date.now() - BACKSTOP_WINDOW_DAYS * 86_400_000).toISOString();

  // Backfill: paid/completed orders that never got an order_settlements row.
  const { data: paidOrders } = await service
    .from('orders')
    .select('id, order_settlements(order_id)')
    .in('status', ['paid', 'completed'])
    .gte('paid_at', since)
    .limit(500);
  for (const order of (paidOrders ?? []) as { id: string; order_settlements: unknown[] }[]) {
    if ((order.order_settlements ?? []).length === 0) {
      await settleOrderVendorEarnings(service, order.id);
      result.backfilled += 1;
    }
  }

  // Clawback: confirmed settlements whose order is now refunded/cancelled.
  const { data: staleConfirmed } = await service
    .from('order_settlements')
    .select('order_id, vendor_net_sen, reversed_amount_sen, orders!inner(status)')
    .eq('status', 'confirmed')
    .in('orders.status', ['refunded', 'cancelled'])
    .limit(500);
  const seen = new Set<string>();
  for (const row of (staleConfirmed ?? []) as { order_id: string; vendor_net_sen: number; reversed_amount_sen: number }[]) {
    if (Number(row.reversed_amount_sen) >= Number(row.vendor_net_sen) || seen.has(row.order_id)) continue;
    seen.add(row.order_id);
    await reverseOrderVendorSettlement(service, row.order_id);
    result.clawedBack += 1;
  }

  return result;
}
